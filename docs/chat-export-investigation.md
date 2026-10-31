# Chat Export & DOM Extraction — Technical Investigation & Feasibility Findings

> **Context**: Generated during **Step 3** of the Chat Export feature roadmap using the active WAllie Dev Bridge (`127.0.0.1:3888` via `scripts/wa-bridge.mjs`). This document records live DOM structures, virtualization behaviors, internal data models, edge cases, and architectural requirements for extracting chat histories from WhatsApp Web.

---

## 1. Executive Architecture Overview

WhatsApp Web presents a hybrid architecture combining an internal Backbone/Custom Collection data layer (`WAWebChatCollection`, `WAWebMsgCollection`, `WAWebReactionsCollection`) with a heavily virtualized React DOM presentation layer (`div[data-testid="conversation-panel-messages"]`).

### Dual-Channel Extraction Model
Extraction can operate through two complementary channels:
1. **Foreground DOM Crawler**: Traverses the mounted elements, handles dynamic clicks (e.g. "Read more" expansions, phone pagination prompts), captures rendered styles, SVG badges, and visual continuity.
2. **Internal Model Hydrator (`window.require`)**: Directly accesses pristine JavaScript model instances (`ChatCollection.getActive()`, `activeChat.msgs._models`, `ReactionsCollection`). Provides un-truncated strings, raw byte sizes, exact Unix epoch timestamps, media keys, and cryptographic hashes without DOM scraping latency.

The optimal exporter architecture is a **Hybrid Foreground Crawler**: driven by the DOM viewport for pagination and visual fidelity, while hydrating rich metadata directly from WhatsApp Web's in-memory models.

---

## 2. Active Chat Identification & Bounds

| Field | Foreground DOM Selector | Model Property (`WAWebChatCollection`) | Notes |
| :--- | :--- | :--- | :--- |
| **Chat Title** | `#main header [data-testid="conversation-info-header-chat-title"]` or `header span[title]` | `ChatCollection.getActive().formattedTitle` | E.g. `"Alex"`, group subjects, or community names |
| **Chat JID** | Extracted from row stanza IDs (`(true\|false)_<JID>_<STANZA_ID>`) | `ChatCollection.getActive().id.toString()` | E.g. `111111111111111@lid` or `phone@c.us` |
| **Chat Type** | Header participant indicators / subtitle | `activeChat.isGroup`, `activeChat.isCommunity`, `activeChat.isNewsletter` | Identifies 1-on-1, Group, Community Announcement, or Channel |
| **Loaded Count** | Count of rendered `[data-id]` in panel | `activeChat.msgs.length` | Total messages currently loaded in local memory |
| **Timestamp (Exact)**| `[data-pre-plain-text]` attribute: `"[11:49 pm, 30/10/2026] Alex: "` | `msg.t` (Unix epoch in seconds) | Direct second-level precision, eliminates locale-dependent date parsing ambiguities |

---

## 3. DOM Virtualization Mechanics & The Sliding Window

WhatsApp Web implements an aggressive virtualizer inside `div[data-testid="conversation-panel-messages"]` to maintain 60 FPS scrolling on low-end machines.

### Key Virtualization Behaviors Observed:

1. **Skeleton Mounts (`data-virtualized="true"`)**:
   - Rows outside the visible viewport do not contain message bubbles. Instead, they render empty skeleton containers with pre-calculated minimum heights:
     ```html
     <div class="x78zum5 xdt5ytf" data-virtualized="true" style="min-height: 213.667px;"><div></div></div>
     ```
   - When scrolled into view, React requires $\sim 100\text{–}150\text{ ms}$ to switch `data-virtualized` to `"false"` and mount `div[data-testid="msg-container"]`.

2. **Sliding Window Pruning (Critical Ingestion Constraint)**:
   - As scrolling moves upward toward older messages, WhatsApp Web **completely drops bottom (newer) message DOM nodes**.
   - The total number of rows mounted in the DOM is bounded at $\sim 90\text{–}110$ items.
   - **Architectural Rule**: The extractor **must never defer parsing until the end of scrolling**. It must streamingly parse and record entries into an in-memory Map (`exportMap.set(stanzaId, entry)`) during each viewport step.

3. **In-Memory Retention**:
   - While DOM nodes are unmounted, `activeChat.msgs._models` keeps all loaded messages in memory.

---

## 4. Message Types & Verified Selectors

### A. Truncated Text & Multi-Chunk Expansion ("Read more")
- **DOM Selector**: `div[role="button"][data-testid="caption-read-more-button"]` (or `.read-more-button`).
- **Discovery**: For very long messages (e.g. 50,000+ characters), clicking "Read more" once only unfolds the next chunk ($\sim 3.9\text{ KB}$).
- **Required Implementation**:
  ```javascript
  while (true) {
    const btn = row.querySelector('[data-testid="caption-read-more-button"], .read-more-button');
    if (!btn) break;
    btn.click();
    await sleep(60);
  }
  ```
  *(Verified: expanded 813 characters to 50,844 characters across 14 consecutive clicks).*
- **Model Shortcut**: In `activeChat.msgs._models`, `msg.body` and `msg.caption` always contain the full, un-truncated text immediately.

### B. Quoted Message Context & Unlocking
- **DOM Selector**: `div[data-testid="quoted-message"]` containing `[role="button"][aria-label="Quoted message"]`.
- **Target Association**:
  - `msg.quotedStanzaID` (e.g. `3EB0000000000000000001`).
  - `msg.quotedParticipant` (JID of original author).
  - `msg.quotedMsg.body` (fallback snippet).
- **Unlocking Traversal**: If a quoted reply references an older message outside the initially loaded history window, the quoted bubble displays fallback text until scrolling reaches the parent message in history.

### C. Polls
- **DOM Selectors**:
  - Container: `div[data-testid="poll-bubble"]`
  - Accessible Summary: `aria-label="Poll from <Author> <Time> <Question> Top vote counts: ..."`
  - Action Button: `button[data-testid="poll-view-votes"]`
- **Model Properties**:
  - `type: "poll_creation"`
  - `pollName`: Question text (e.g. `"Going or now"`)
  - `pollOptions`: Array of `{ name: string, localId: number }`
  - `pollSelectableOptionsCount`: `0` for multi-select, `1` for single-choice.

### D. Events
- **DOM Selectors**:
  - Container: `div[data-testid="event-creation-msg"]`
  - Accessible Summary: `aria-label="Event: <Title> Description: <Desc>. <Time>. <Location>. <Attendees>"`
  - Action Button: `button[data-testid="event-rsvp-respond"]` ("Edit event" / "Respond")
- **Model Properties**:
  - `type: "event_creation"`
  - `__x_eventName`: Event title
  - `eventDescription`: Event description
  - `eventStartTime`: Unix epoch timestamp
  - `eventLocation`: `{ name: string, degreesLatitude: number, degreesLongitude: number }`

### E. Media & Download States
- **Undownloaded Media**:
  - `data-testid="media-state-download"` with `<title>ic-download</title>` and file size text (e.g. `"2 MB"` or `"78 kB"`).
- **Download Attempt & Expiration Lifecycle (Live Discovery)**:
  - When clicking an old media download button, WhatsApp Web sends an encrypted GET request to Meta's CDN (`media.*.fna.whatsapp.net`).
  - **Signed URL Expiry**: For older media (months old), the signed token has expired, returning **HTTP 403 Forbidden**.
  - **Transition to Pending**: Upon receiving 403, WhatsApp Web switches `data-testid="media-state-download"` to `data-testid="media-state-pending"`, rendering an active SVG spinner and an interactive cancel button (`<title>ic-close</title>`).
  - **Internal `mediaStage` States**:
    - `"INIT"`: Not yet initialized.
    - `"RESOLVED"`: Fully downloaded and available locally as a Blob URL.
    - `"NEED_POKE"`: Media requires a peer synchronization request to the primary phone to re-sign or re-upload the asset.
    - `"REUPLOADING"`: In-flight poke/re-upload request with peer phone.
- **Binary Media Extraction via Same-Origin Blob URLs**:
  - For all `"RESOLVED"` media, the DOM renders inside `data-testid="media-url-provider"`:
    ```html
    <img src="blob:https://web.whatsapp.com/<uuid>" />
    ```
  - **Extraction Feasibility**: Because the renderer script runs inside the same origin (`https://web.whatsapp.com`), executing:
    ```javascript
    const res = await fetch(img.src);
    const buffer = await (await res.blob()).arrayBuffer();
    ```
    yields the exact byte-for-byte binary file (`ArrayBuffer`), matching the exact `size` and `mimetype` without CORS restrictions. This enables streaming directly to the companion directory (`<name>_files/<asset_id>.jpg`).
- **Inline Thumbnails (Expired Media Fallback)**:
  - Even when the full media has expired or is stuck at `"NEED_POKE"`, `msg.body` contains the inlined base64 JPEG thumbnail (`/9j/4AAQ...`). The exporter persists this thumbnail, marking `media.isDownloaded = false` so the viewer can display a blurred fallback preview rather than a broken image.

### F. Reactions
- **DOM Container**: `<div data-testid="addon-bubble-container">` containing:
  - `<button data-testid="reaction-bubble" aria-label="Reactions <EMOJIS> <COUNT> in total. View reactions">`
  - Child items: `<div data-testid="reaction-bubble-item"><img alt="🥲" ...></div>`
  - Total count badge: `<span class="...">2</span>`
- **Internal Model**:
  - `window.require("WAWebReactionsCollection").ReactionsCollection`
  - `ReactionsCollection.get(stanzaId)` exposes `reactions._models[i].__x_aggregateEmoji`, sender lists, and `__x_hasReactionByMe`.

### G. System Notifications & Date Dividers
- **Date Dividers**: Centered pills `<div class="x141l45o ..."><span>Yesterday</span></div>`.
- **System Notices**: `<div data-testid="msg-notification-container">` with stanza ID.
- **Group Lifecycle Events (`gp2`)**:
  - Description Changed: `type: "gp2"`, `subtype: "description"`:
    - DOM: `<div data-testid="msg-notification-container">` containing `"You changed the group description. View"` or `"<User> changed the group description. View"`.
    - CTA Action: `<span role="button">View</span>` linking to the group info description sheet.
    - Export Mapping: Stored as `SystemNotificationEntry` with `subtype: "group_description_change"`.
  - Leave: `type: "gp2"`, `subtype: "leave"` renders `"~<User> left"`.
  - Add / Join: `type: "gp2"`, `subtype: "add"` renders `"<Admin> added <User 1> & <User 2>. View members"`.
  - Community Linked Join: `type: "gp2"`, `subtype: "linked_group_join"`:
    - Dedicated test ID: `data-testid="subtype-linked_group_join"`.
    - Text: `"~<User> joined from the community. <span data-testid="system-notification-cta-text">Send message history</span>"`.
  - Stanza ID: e.g. `true_<GROUP_JID>_<TIMESTAMP>_<AUTHOR_JID>`.
- **Message History Notices**: `type: "message_history_notice"` (e.g. notices regarding recent history sharing upon member additions).
- **Security Code Change Notice**:
  - DOM: `<div data-testid="msg-notification-container">` containing `<span data-testid="system_message">` and CTA text `<span data-testid="system-notification-cta-text">Learn more</span>`.
  - Model: `type: "e2e_notification"`, `subtype: "identity"`, `body: "<Target JID>"`.
- **Community Announcement Badges & Hierarchy**:
  - Author Name: `<span data-testid="author">`
  - Role Label Container: `<div data-testid="group-agent-owner-label-container">Community admin</div>`
  - Group $\leftrightarrow$ Community Link: Child group model provides `groupMetadata.parentGroup` referencing the parent community group JID (e.g. `120363000000000000@g.us`), whose title is resolved via `ChatCollection.get(parentGroupJid).formattedTitle`.
### H. Forwarded & "Forwarded Many Times" Tags

WhatsApp differentiates regular forwarded messages from viral/chain messages ("frequently forwarded"):

1. **DOM Structure (`forwarded-header`)**:
   - Container: `<div data-testid="forwarded-header" class="xe9ewy2">`
   - Single Forward:
     - Icon: `<svg><title>ic-fast-forward</title></svg>`
     - Text: `<span class="...">Forwarded</span>`
   - Forwarded Many Times:
     - Icon: Double fast-forward arrows
     - Text: `<span class="...">Forwarded many times</span>` (italicized style)
     - Optional Misinformation Action: `<div data-testid="search-web-button">` (magnifying glass enabling the user to search the message text on Google).

2. **Internal Data Models & Resolution Logic**:
   - Condition Evaluation:
     ```javascript
     const shouldShow = WAWebFrontendMsgGetters.getShouldShowForwarded(msg);
     const isFrequently = WAWebMsgGetters.getIsFrequentlyForwarded(msg);
     const indicatorText = WAWebForwardUtils.getForwardedIndicatorText(isFrequently);
     // Returns: "Forwarded" (false) vs "Forwarded many times" (true)
     ```
   - Model Properties on `Msg`:
     - `msg.isForwarded`: Boolean indicating forwarded origin.
     - `msg.forwardingScore`: Integer (typically $\ge 5$ triggers `"Forwarded many times"`).
     - `msg.forwardsCount`: Counter tracking propagation.

### I. Person Mentions (`@` User Tags)

WhatsApp Web handles user mentions with rich metadata linking raw JIDs to localized display names:

1. **DOM Presentation (`data-app-text-template` & `data-plain-text`)**:
   - Inside `span[data-testid="selectable-text"]`, user mentions are rendered as interactive button spans:
     ```html
     <span role="button" tabindex="0">
       <span data-testid="select-all selectable-text"
             data-plain-text="@Alex (User)"
             data-app-text-template="​222222222222222@lid​"
             class="selectable-text select-all copyable-text">
         @<span dir="ltr">Alex (User)</span>
       </span>
     </span>
     ```
   - **`data-plain-text`**: The rendered, localized contact/display name (e.g. `"@Alex (User)"`).
   - **`data-app-text-template`**: The exact target JID enclosed in zero-width spaces: `​<JID>​` (e.g. `​222222222222222@lid​`).
   - **`role="button"`**: Interactive element opening contact details / profile on click.

2. **Underlying Model Representation**:
   - **Raw Body (`msg.body`)**: Mentions are stored as tokenized IDs without domain suffixes:
     `"@222222222222222 Please review the update when you have time"`
   - **Recipient List (`msg.mentionedJidList`)**: Array of full JID strings:
     `["222222222222222@lid"]`
   - **Viewer Reconstruction**: The exporter can store both the tokenized body and a map of `{ [jid]: displayName }` so the Chat Export Viewer faithfully renders the styled `@Name` badge with accent highlights and link behavior.

### J. Group Member Tags / Labels (Text Below Author's Name)

In group chats, WhatsApp supports custom **Member Tags / Member Labels** that appear directly below a participant's author name:

1. **DOM Structure**:
   - Within the author header container (`.x1iorvi4 ...`), the header is split into two stacked rows:
     ```html
     <div class="...">
       <!-- Top Row: Author Display Name -->
       <div role="">
         <span data-testid="author" role="button" tabindex="0">Alex (Admin)</span>
       </div>
       <!-- Bottom Row: Member Tag / Label -->
       <div>
         <div role="button" tabindex="0">
           <span style="--x-fontSize: 12px; ...">Core Contributor</span>
         </div>
       </div>
     </div>
     ```
   - Rendered with `--x-fontSize: 12px` in subdued secondary styling.
   - Interactive: Has `role="button" tabindex="0"`, allowing members with edit permission to edit the label.

2. **Internal Data Architecture (`WAWebMemberLabelCollection`)**:
   - **Collection**: `window.require("WAWebMemberLabelCollection")`
   - **Key Format**: Composite key of `<GROUP_JID>_<MEMBER_LID>` (e.g. `120363000000000001@g.us_333333333333333@lid`).
   - **Model Fields**:
     - `__x_label`: The custom member tag string (e.g. `"Core Contributor"`, `"Moderator"`, `"Project Lead"`).
     - `__x_lastEditTimestamp`: Epoch timestamp of last tag modification.
   - **Helper Utilities**:
     - `WAWebMemberLabelsFrontendUtils.shouldShowMemberLabelForMsg(...)`
     - `WAWebMemberLabelRenderer.react`: The rendering component.

3. **Viewer Representation**:
   - Group messages whose sender has an entry in `memberLabels[groupJid][senderLid]` render the secondary tag line at 12px font size directly underneath the author's colored name pill before the message bubble content.

### K. Call Logs & Missed Calls

Calls are recorded as discrete messages in WhatsApp Web timelines with specialized pill and bubble layouts:

1. **DOM Structure**:
   - **Wrapper Element**: `<div role="button" tabindex="0" data-testid="voip_icce_bubble_1on1_call">`
   - **Inner Container**: `<div data-testid="call-log-system-message">`
   - **Icon Chip**: `<div data-testid="call-log-icon-chip">`
     - **Voice Call Icon**: `<svg><title>ic-phone-callback-filled</title>...</svg>`
     - **Video Call Icon**: `<svg><title>wds-ic-call-video-received-filled</title>...</svg>`
   - **Text Labels**:
     - Primary title: `"Missed voice call"`, `"Missed video call"`, or `"Missed group call"`
     - Subtitle / Action:
       - 1-on-1: `"Click to call back"`
       - Group: `"<N> invited"` (e.g. `"5 invited"`)
   - **Timestamp**: `<div data-testid="msg-meta"><span>1:09 pm</span></div>`

2. **Underlying Model Representation (`msg.type === "call_log"`)**:
   - `type`: `"call_log"`
   - `isVideoCall`: `true` (Video call) vs `false` (Voice call)
   - `callDuration`: `0` or `null` indicates an **unanswered / missed call**; `callDuration > 0` indicates the active call duration in seconds (e.g. `593`).
   - `id.fromMe`: `true` indicates an outgoing call placed by the current user; `false` indicates an incoming call.
   - `callCreator`: JID of the initiator (e.g. `444444444444444@lid`).
   - `t`: Epoch timestamp in seconds.

3. **Viewer Representation**:
   - Call log bubbles render in an incoming/outgoing bubble layout with the distinctive call icon (phone receiver or video camera with angled arrow), call type description ("Missed voice call", "Voice call (9m 53s)", "Missed group call"), and timestamp.

---

## 5. Phone Pagination & On-Demand Peer History Sync

### A. Button Hierarchy & States
- **Container**: `div[data-testid="conversation-panel-messages"].children[1]`.
- **Initial State**:
  ```html
  <button class="..."><div><div>Click here to get older messages from your phone.</div></div></button>
  ```
- **Sync Trigger Action**: Clicking this button invokes:
  ```javascript
  sendPeerDataOperationRequest(
    Message$PeerDataOperationRequestType.HISTORY_SYNC_ON_DEMAND,
    { chatId }
  )
  ```
- **In-Flight Loading State**:
  - The button is replaced with an active spinner:
    `<span data-testid="loading-spinner" data-visualcompletion="loading-state"><svg width="24" height="24" ...></svg></span>`
- **Failure / Phone Offline State**:
  - If the primary phone is locked, asleep, or disconnected, the container transforms into an error retry button:
    ```html
    <button class="...">
      <svg><title>ic-error-filled</title></svg>
      <div>Couldn't get older messages. Open WhatsApp on your phone and click here to try again.</div>
    </button>
    ```
  - Clicking this retry button triggers a new peer sync request once the user wakes their phone.
- **Success State**:
  - As the phone responds over the peer socket, WhatsApp Web receives history bundles, injects them into local storage, increments `activeChat.msgs._models`, expands `scrollHeight`, and updates the earliest available date boundary. In the investigated Community chat, the local boundary was an earlier date (`1700000000`).

---

## 6. Abortability & Stream Guarantees

Because the extraction engine accumulates parsed polymorphic records into an in-memory dictionary on every scroll step:
1. If the user cancels or an error occurs mid-traversal, all gathered entries are sorted chronologically.
2. The envelope is stamped with `exportRange.completed = false`, `earliestTimestamp`, and `latestTimestamp`.
3. The resulting `.json` file remains completely valid under `docs/chat-export-spec.md` and renders without errors in the viewer.

# WhatsApp Web Portrait Mode & Resolution-Constrained Responsive Layout — Technical Investigation

> **Context**: Generated during live Dev Bridge investigation (`scripts/wa-bridge.mjs` on `127.0.0.1:3888`) of WhatsApp Web's DOM layout, flex hierarchy, animations, drawer behavior, and modal structures under resolution constraints. This document details the exact DOM findings, why native resizing fails, and the DOM splicing & view transition architecture required to support portrait and narrow screen modes cleanly.

---

## 1. Executive Summary & Problem Definition

Desktop WhatsApp Web is engineered exclusively as a multi-pane horizontal layout with a hardcoded desktop breakpoint minimum width of **748px** (`.x1ljrdzs { min-width: 748px }`). On portrait displays, narrow windows, tiling window managers, or mobile/tablet foldables:
1. **Horizontal Clipping & Overflow**: WhatsApp Web flexes both the list pane (~340px) and the conversation pane (~340px) side-by-side, causing content to be squashed and cropped when the window width is under 748px.
2. **Layout Thrashing from CSS Width Animations**: When attempting to animate element widths (e.g. from 100% to 0%), WhatsApp Web's internal React `ResizeObserver` instances and layout managers recalculate the virtualized contact list (`#pane-side`) and message bubble heights on every animation frame. This produces severe stuttering, frame drops (dropping from 60fps to 10–15fps), and broken scroll positions.
3. **Three-Pane Conflict**: In standard desktop view, clicking a contact's header expands a third right-hand sidebar (`[data-testid="drawer-right"]`) for Contact/Group/Channel info. On narrow screens, showing 3 panes (or even 2) simultaneously is unusable.

### Core Objective
Implement a flawless **single-pane portrait mode** where:
- At any given time, **exactly one pane** is visible:
  1. **Left Sidebar / List View** (Chats list, Calls list, Status list, Channels list, Communities list).
  2. **Center / Main View** (Active Chat, Call Info, Camera modal, Attachment preview modal).
  3. **Right Sidebar / Info View** (Contact Info, Group Info, Channel Info, Starred messages in chat).
- Navigation rail stays pinned on the left (64px width).
- Clicking the active navigation rail tab toggles between the List view and the Chat view.
- For every page/tab change, the UI **must first start in List View**.
- Clicking any list item transitions smoothly into the Main/Chat view.
- In Chats, Channels, and Communities, a back button is injected before the avatar circle in `#main header` to return to the List view.
- In Calls, clicking a call history row opens Call Info (`drawer-middle`), which occupies the full width and has a native close button.
- In Status, clicking a status opens the fullscreen viewer (`drawer-fullscreen`), which already occupies the full viewport.
- Communities with nested sub-chats must be handled correctly: clicking a community expands its sub-chat list inside the sidebar (staying in List view), while clicking a specific sub-chat transitions to the Chat view.
- Camera and Attachment Preview modals (rendered inside `drawer-middle`) must occupy the full content width and return gracefully to the Chat view upon closing.
- Transitions must use **DOM splicing & GPU-accelerated transforms** rather than width resizing, preserving 60fps smoothness and preventing WhatsApp's virtualized list re-layouts.

---

## 2. WhatsApp Web DOM Hierarchy & Pane Map

All primary UI elements are housed under `[data-testid="wa-web-main-screen"] > div` (which switches between classes `.two` and `.three`).

```mermaid
graph TD
    App["#app"] --> MainScreen["wa-web-main-screen"]
    MainScreen --> TwoThree["div.two / div.three (Flex Row)"]
    TwoThree --> C0["c0: HEADER (w: 64px)<br/>data-testid='chatlist-header'<br/>Vertical Navigation Rail"]
    TwoThree --> C1["c1: DIV (w: 100% - 64px)<br/>data-testid='drawer-fullscreen'<br/>Fullscreen Status / Media Viewer"]
    TwoThree --> C2["c2: DIV (position: absolute; full width)<br/>Left & Middle Drawers Container"]
    C2 --> DL["data-testid='drawer-left'<br/>(Calls, Status, Channels, Communities, Settings, Profile)"]
    C2 --> DM["data-testid='drawer-middle'<br/>(Call Info, Camera Capture, Attachment Preview)"]
    TwoThree --> C3["c3: DIV (w: 512px / 30%)<br/>#pane-side Chats List Pane"]
    TwoThree --> C4["c4: DIV (flex: 1 1 auto)<br/>#main Active Conversation Pane"]
    TwoThree --> C5["c5: DIV (Backdrop / Overlay)"]
    TwoThree --> C6["c6: DIV (w: 0px or 30%)<br/>data-testid='drawer-right'<br/>Contact / Group / Channel Info"]
    TwoThree --> C7["c7: DIV (Auxiliary)"]
    TwoThree --> C8["c8: DIV #wds-toast-container"]
```

### Detailed Child Pane Table

| Index | Element Selector | TestID / ID | Normal Desktop Role | Portrait Role |
| :--- | :--- | :--- | :--- | :--- |
| **0** | `HEADER` | `chatlist-header` | 64px navigation rail with icon buttons | Pinned at left (64px width) |
| **1** | `DIV` | `drawer-fullscreen` | Fullscreen drawer (Status viewer) | Fullscreen drawer (`left: 64px; width: calc(100% - 64px)`) |
| **2** | `DIV` | Contains `drawer-left` & `drawer-middle` | Absolute overlay container (`w: 100%`) | Houses Left Drawer (List view) and Middle Drawer (Call Info / Media / Camera) |
| **3** | `DIV` | Contains `#pane-side` | Chats list sidebar (width ~30% / 512px) | **List View** for Chats tab (`width: calc(100% - 64px)`) |
| **4** | `DIV` | Contains `#main` | Chat conversation pane (flex: 1 1 auto) | **Chat View** for Chats, Channels, Communities (`width: calc(100% - 64px)`) |
| **5** | `DIV` | — | Shading / backdrop container | Hidden or pass-through |
| **6** | `DIV` | `drawer-right` | Contact/Group/Channel info panel | **Info View** (`width: calc(100% - 64px)`) |

---

## 3. Deep-Dive Findings Per View & Tab

### 3.1 Navigation Rail (`c0`)
- Located at: `[data-testid="wa-web-main-screen"] > div > header`
- Width: Fixed at `64px`.
- Contains tab buttons with `aria-label`:
  - `"Chats"`, `"Calls"`, `"Status"`, `"Channels"`, `"Communities"`, `"Meta AI"`, `"Media"`, `"You"`
- **Active Tab Detection**:
  WhatsApp Web marks the active tab button using `aria-pressed="true"`. All other tab buttons have `aria-pressed="false"`.
- **Rail Toggle Behavior**:
  - Clicking a **different** tab switches to that section. Per requirement, the new section must **always initialize in List View**.
  - Clicking the **currently active** tab (`aria-pressed="true"`) functions as a view toggle:
    - If in Chat View or Info View -> switch to **List View**.
    - If in List View (and an active chat/history exists) -> switch to **Chat View**.

### 3.2 Chats Tab (`aria-label="Chats"`)
- **List View**: Rendered in `c3` (`#pane-side`). Each chat is a `[role="row"]` or `[data-testid^="list-item-"]`.
- **Chat View**: Rendered in `c4` (`#main`).
- **Back Button Placement**:
  - Header hierarchy: `#main header > div:first-child` contains:
    1. Child 0: `div[role="button"]` (Avatar display picture circle)
    2. Child 1: `div[role="button"]` (Chat title text & participant subtitle)
  - The Back button must be inserted **immediately before child 0** (the display picture circle).
  - Native SVG Arrow icon:
    ```html
    <svg viewBox="0 0 24 24" height="24" width="24" preserveAspectRatio="xMidYMid meet" fill="currentColor">
      <title>ic-arrow-back</title>
      <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path>
    </svg>
    ```
  - Clicking the Back button switches the active portrait view from CHAT to LIST.

### 3.3 Calls Tab (`aria-label="Calls"`)
- **List View**: Rendered inside `c2 > div[data-testid="drawer-left"]`.
  - In desktop mode, `drawer-left` has `margin-left: 64px; width: 512px`.
  - In portrait mode, `drawer-left` must expand to `width: calc(100% - 64px)`.
- **Call Info View**: Rendered inside `c2 > div[data-testid="drawer-middle"]`.
  - When no item is selected, `drawer-middle` displays call options ("Start call", "New call link").
  - When a call history row is clicked, `drawer-middle` loads the Call Info page with:
    - `header`: Text "Call info"
    - `button[aria-label="Close"]`: Native close button at top-right
  - In portrait mode, `drawer-middle` must have `left: 64px; width: calc(100% - 64px);`.
  - Clicking the native `Close` button reverts `drawer-middle` and switches back to the Calls List view.

### 3.4 Status Tab (`aria-label="Status"`)
- **List View**: Rendered inside `c2 > div[data-testid="drawer-left"]`.
- **Status Viewer**: Rendered inside `c1 > div[data-testid="drawer-fullscreen"]`.
  - Already natively occupies the full viewport (`w: calc(100% - 64px)`).
  - Pressing Escape or clicking WhatsApp's close button closes `drawer-fullscreen` and returns to the Status list.

### 3.5 Channels Tab (`aria-label="Channels"`)
- **List View**: Rendered inside `c2 > div[data-testid="drawer-left"]`.
- **Channel Feed**: Rendered in `c4` (`#main`), identical in structure to a normal chat.
- Back button inserted before the channel avatar circle in `#main header` returns to the Channels List view.

### 3.6 Communities Tab (`aria-label="Communities"`)
- Communities feature a **3-level navigation hierarchy**:
  - **Level 1 (Top-Level Communities List)**: Shows all joined communities (`[data-testid="community-tab-community-cell"]`) with pinned announcements and sub-groups (`[data-testid="community-tab-subgroup-cell"]`).
  - **Level 2 (Community Navigation Drawer)**: Clicking a community header (`community-tab-community-cell`) drills down into `[data-testid="community-navigation-drawer"]` inside `drawer-left`. This view displays all sub-groups for that specific community under `[data-testid="section-your-groups"]`. It includes a native WhatsApp back button (`[data-testid="back"]`) in its header to return to Level 1.
  - **Level 3 (Sub-Group Chat / Announcement Feed)**: Clicking any specific sub-chat row (e.g. "Announcements", "Official Class Group") opens `#main` (`c4`).
- **Splicing & Event Handling**:
  - Clicking a community header (`community-tab-community-cell`) stays in **LIST view** (user is navigating into `community-navigation-drawer` within `drawer-left`).
  - Clicking a sub-chat inside `community-navigation-drawer` (`[data-testid="community-navigation-drawer"] [role="listitem"]`) or a sub-chat row in Level 1 (`[data-testid="community-tab-subgroup-cell"]`) transitions to **CHAT view** and injects the back button.
  - Clicking the injected Back button in `#main header` returns directly to `community-navigation-drawer` (Level 2), and clicking the drawer's native back button returns to the top-level Communities list (Level 1).
  - Toggling via the navigation rail: The right pane is empty by default on Communities until a sub-group is chosen, so rail clicking in Communities tab stays in List view if already in List view, and returns to List view from Chat view.

### 3.7 Right Sidebar / Info Pane (`[data-testid="drawer-right"]`)
- Triggered by clicking the chat avatar or title in `#main header`.
- When opened:
  - Parent container toggles class from `.two` to `.three`.
  - WhatsApp plays CSS animation `@keyframes x1h4ohyg-B { 0% { flex-basis: 0%; } 100% { flex-basis: 30%; } }`.
  - WhatsApp squashes `c4` from 100% to ~60% and expands `drawer-right` to 30%.
- **Portrait Splicing Requirement**:
  - Only ONE pane visible! `drawer-right` must occupy `100%` of the content area (`calc(100% - 64px)`), while `c3` and `c4` are moved off-screen via `transform: translate3d(-100%, 0, 0)`.
  - Override WhatsApp's `flex-basis: 30%` keyframe/style with `flex: 0 0 calc(100% - 64px) !important; width: calc(100% - 64px) !important;`.
  - Closing `drawer-right` (via its native `button[aria-label="Close"]`) smoothly returns to the Chat view.

### 3.8 Camera & Attachment Preview Modals
- Triggered via composer footer `button[aria-label="Attach"]` -> "Camera" or file selection.
- Both the Camera capture stream (`[data-testid="camera_capture_take_photo_btn"]`) and the Media Editor / Attachment Preview ("Retake", filters, stickers, caption bar, send button) are rendered inside:
  `c2 > div[data-testid="drawer-middle"]`
- In portrait mode:
  - `drawer-middle` occupies `position: absolute; left: 64px; width: calc(100% - 64px); height: 100%; z-index: 350;`.
  - Its native `button[aria-label="Close"]` closes the preview and returns to the Chat view.

### 3.9 Popups, Flyout Menus & Modals Workarounds

#### 1. Emoji / GIFs / Stickers Flyout Panel (`#expressions-panel-container`)
- **Problem**: WhatsApp Web mounts the floating expression panel inside `#expressions-panel-container` as a direct child of `.app-wrapper-web`. It computes inline positioning (`left: -138.8px; bottom: 77.6px;`) based on desktop sidebar coordinates, placing the panel off-screen to the left behind the 64px navigation rail. Additionally, the panel has a hardcoded default width of `560px`, which overflows and clips when window width is under 600px.
- **Solution**:
  - Re-align the floating container in portrait or collapsed mode to `left: 68px !important; right: auto !important;`.
  - Constrain its width dynamically with `width: min(560px, calc(100vw - 76px)) !important; max-width: calc(100vw - 76px) !important;`.
  - Set `width: 100% !important; max-width: 100% !important;` on `[data-testid="expressions-panel"]`.
  - Internal components (emojis grid, GIF search box and column grid, sticker packs) flex responsively down to 320px with zero horizontal overflow.

#### 2. Attachment Popup Menu (`button[aria-label="Attach"]` / `+`)
- **Problem**: The popover container (`div.xu96u03`) uses `transform: translate(102px, 642px) translate(-50%, -100%)`. With a menu width of ~171px and the Attach button center at ~102px, `102px - (171px / 2) = 16.5px`, causing the menu to overlap the 64px navigation rail by ~48px.
- **Solution**:
  - Specifically target bottom popup menus using `div.xu96u03[style*="-50%, -100%)"]` (avoiding false positives with top-down menus like the 3-dots chat menu which use `translate(-100%, 0px)`).
  - Apply `left: 52px !important;` in portrait mode or collapsed landscape mode. This shifts the menu coordinate by 52px (`16.4px + 52px = 68.4px`), placing it right beside the 64px rail with a clean 4px gutter.

#### 3. Fullscreen Profile Photo & Media Lightbox Overlays (`.app-wrapper-web > span:has(> div)`)
- **Problem**: When clicking a contact's profile photo ("View photo") or an image in chat, WhatsApp Web mounts a fullscreen lightbox overlay into a portal `<span>` directly under `.app-wrapper-web`.
  - The overlay uses fixed positioning with native `z-index: 500`.
  - However, in our portrait layout, the 64px vertical navigation rail (`chatlist-header`) was also given `z-index: 500 !important;` to stay above sliding drawer panes.
  - Because `wa-web-main-screen` (which contains `chatlist-header`) appears after the portal `<span>` in `.app-wrapper-web`'s DOM order, with identical z-indices (`500` vs `500`), the navigation rail painted on top of the fullscreen modal overlay.
  - As a result, the left 64px of the photo viewer (including image content and top header padding) was cut off and obscured behind the rail icon buttons.
- **Solution**:
  - Elevate all portal overlay spans and their direct containers to `z-index: 1000 !important;`:
    ```css
    .app-wrapper-web > span:has(> div) {
      position: relative !important;
      z-index: 1000 !important;
    }
    .app-wrapper-web > span > div {
      z-index: 1000 !important;
    }
    ```
  - Because `1000 > 500`, the fullscreen overlay and its backdrop now cleanly cover the entire viewport, including the navigation rail. When closed (via the top-right 'X' button or Escape), the overlay unmounts and the underlying view (Contact info or Chat) resumes without any visual artifacts.

---

## 4. Why Native Resizing Fails & The DOM Splicing Solution

### The Resize Failure
```
[User Window Resize / Width CSS Animation]
   │
   ▼
[Element Width changes: 500px -> 450px -> 400px ... frame by frame]
   │
   ▼
[WhatsApp ResizeObserver fires 60 times/sec]
   │
   ▼
[React re-computes virtual list item offsets & line wraps]
   │
   ▼
💥 Severe Jank (10-15 fps), Scroll Disconnect, Truncated Elements
```

### The DOM Splicing Architecture
Instead of animating `width` during pane transitions:
1. **Constant Sized Viewport Layers**: Every pane (`c3`, `c4`, `drawer-left`, `drawer-middle`, `drawer-right`) is given a constant width equal to the full content viewport (`calc(100vw - 64px)` or `calc(100% - 64px)`).
2. **GPU Compositor Transforms**: Transitions between List, Chat, and Info view are powered entirely via `transform: translate3d(...)` or staged sliding view wrappers with hardware acceleration.
3. WhatsApp's virtualizer sees an unchanging container width, completely bypassing expensive recalculations!

```mermaid
sequenceDiagram
    autonumber
    participant User as User
    participant State as Portrait View Controller
    participant Rail as Nav Rail (c0)
    participant List as List Pane (c3 / drawer-left)
    participant Chat as Chat Pane (c4 / drawer-middle)
    participant Info as Info Drawer (c6)

    Note over List,Info: Initial State: Portrait Mode, View = "LIST"
    List->>List: Visible (transform: translateX(0), w: 100%)
    Chat->>Chat: Off-screen (transform: translateX(100%))

    User->>List: Clicks Chat Row
    List->>State: Item Clicked Event
    State->>State: Set View = "CHAT"
    State->>List: Animate translateX(-100%) (GPU)
    State->>Chat: Animate translateX(0) (GPU)
    Note over List,Chat: Smooth 60fps Slide Transition, Zero DOM Width Reflow

    User->>Chat: Clicks Injected Back Button
    Chat->>State: Back Clicked
    State->>State: Set View = "LIST"
    State->>List: Animate translateX(0)
    State->>Chat: Animate translateX(100%)

    User->>Rail: Clicks Active Nav Tab
    Rail->>State: Active Tab Clicked (Toggle)
    State->>State: If CHAT -> switch to LIST; If LIST -> switch to CHAT
```

### 4.3 Native Container Scroll Bug & Horizontal Scroll Lock

#### The Phenomenon
When clicking on certain conversation types (most notably **community sub-groups** or whenever WhatsApp Web programmatically calls `.focus()` / auto-scrolls to an off-screen element), WhatsApp Web activates `.two.app-animating` on the main screen container (`[data-testid="wa-web-main-screen"] > div`) and sets `scrollLeft = 668` (the full width of the left pane).

```
Normal Layout:
[ Rail: 0 to 64px ][ Left Pane: 64 to 732px ] | [ #main (hidden): 732 to 1400px ]

When WhatsApp sets container.scrollLeft = 668px:
Screen viewport shows coordinates 668px to 1400px:
[ Rail pushed to -668px ] [ Left Pane pushed to -604px ] [ #main rendered at 64px ]
💥 Entire layout shifted left by 668px! Rail disappears, back button unreachable, UI stuck!
```

#### Why `overflow: hidden` Fails
In CSS, `overflow: hidden` removes visible scrollbars, but **allows programmatic scrolling** via JavaScript (`element.scrollLeft = 668`) and browser auto-scroll-into-view. Furthermore, because `#main` is positioned with `transform: translate3d(100%, 0, 0)`, Chromium considers the scrollable overflow width of the container to be `64px + 668px + 668px = 1400px`, allowing scroll offsets up to 668px.

#### The Solution: JavaScript Property Descriptor Lock (`lockMainScreenScroll`)
To permanently eliminate horizontal container shifting in portrait mode:
1. **Property Interception**: Override `scrollLeft` on `[data-testid="wa-web-main-screen"] > div` via `Object.defineProperty`:
   - In portrait mode: Force the setter to execute `origDescriptor.set.call(this, 0)` regardless of what value WhatsApp's React code passes.
   - In landscape mode: Forward normally to native `Element.prototype.scrollLeft`.
2. **Method Interception**: Intercept `container.scrollTo` and `container.scroll`, rewriting any `{ left: N }` options to `{ left: 0 }`.
3. **Event Trap**: Register an active `scroll` event listener on `container` that resets `container.scrollLeft = 0` immediately if a browser layout pass ever introduces a non-zero horizontal scroll.
4. With horizontal scroll guaranteed at `0`, all panes remain strictly aligned with the 64px navigation rail at all times.

---

## 5. Architectural State Machine

```mermaid
stateDiagram-v2
    [*] --> LIST: Page Load / Tab Switch

    state LIST {
        [*] --> ChatList: Chats Tab
        [*] --> CallList: Calls Tab
        [*] --> StatusList: Status Tab
        [*] --> ChannelList: Channels Tab
        [*] --> CommunityList: Communities Tab
    }

    LIST --> CHAT: Click Chat / Channel / Sub-chat row
    LIST --> CHAT: Click Call History row (Call Info)
    LIST --> CHAT: Rail Active Tab Toggle (if previous chat active)

    state CHAT {
        ChatView: #main Conversation
        CallInfoView: Call Info in drawer-middle
        CameraMediaView: Camera / Attachment in drawer-middle
    }

    CHAT --> LIST: Click Injected Back Button (#main header)
    CHAT --> LIST: Click Close Button (Call Info / Media)
    CHAT --> LIST: Click Active Tab in Nav Rail

    CHAT --> INFO: Click Chat Header Avatar/Title
    INFO --> CHAT: Click Close Button in drawer-right
    INFO --> LIST: Click Active Tab in Nav Rail
```

---

## 6. Detailed DOM Selectors & Hook Points

### Injected Back Button
- **Container**: `#main header > div:first-child`
- **Insertion Index**: Prepend before first child (`div[role="button"]:first-child`)
- **Attributes**:
  - `class`: `walinux-portrait-back-btn`
  - `aria-label`: `"Back to chats"`
  - `role`: `"button"`
  - `tabindex`: `"0"`
- **Icon**: Native WhatsApp back arrow SVG `ic-arrow-back`.

### Navigation Rail Hook
- **Container**: `[data-testid="wa-web-main-screen"] > div > header`
- **Selector for Active Button**: `button[aria-pressed="true"]`
- **Click Interceptor**: Listen in capture phase on the rail:
  - If target button has `aria-pressed="true"`:
    - Prevent default WhatsApp re-click.
    - Toggle between `LIST` and `CHAT` state.
  - If target button has `aria-pressed="false"`:
    - User is switching tabs.
    - Reset state to `LIST` view immediately so the destination tab opens in List View!

### Communities Sub-Chat Detection
- List item selector: `[data-testid="cell-frame-title"]`
- Distinguish community header vs sub-chat:
  - Community headers in Level 1 navigate deeper inside `drawer-left` (shows "Announcements", "Groups you're in", and native Back button).
  - Sub-chats (or direct group chats) open `#main` (`c4`).
  - By monitoring `#main` header change / row click target, only trigger CHAT view transition when an actual chat row is selected.

### Right Drawer Animation Override
- Target: `div.two > [data-testid="drawer-right"]`, `div.three > [data-testid="drawer-right"]`
- WhatsApp keyframe override:
  - Ensure `flex-basis: 100%` when active in portrait mode.
  - Hide or translate `c3` and `c4` off-screen so only `drawer-right` is visible.

---

## 7. Implementation Architecture & Status

All responsive layout enhancements are implemented in [`src/preload/inject/responsiveLayout.ts`](file:///home/ilam_common/DevHome/GitHub/walinux/src/preload/inject/responsiveLayout.ts) and verified via the Dev Bridge:

### 7.1 Three-Mode Responsiveness Setting
Configurable at runtime and synchronized across IPC:
1. **`disabled` (Always Landscape)**: Preserves WhatsApp Web's desktop multi-pane layout. Rail toggle collapses/expands the left sidebar (`data-walinux-sidebar-collapsed="true"`).
2. **`auto` (Automatic)**: Activates portrait single-pane mode when `window.innerWidth <= 900px` or `window.innerWidth < window.innerHeight` (portrait aspect ratio).
3. **`portrait` (Always Portrait)**: Forces single-pane portrait mode regardless of window dimensions.

### 7.2 State & Transition Matrix

| Current View | Trigger Event | Destination View | Action Performed |
| :--- | :--- | :--- | :--- |
| **LIST** | Click chat / channel / community sub-group row | **CHAT** | `translate3d(0, 0, 0)` on `#main`, back button injected into `#main header` |
| **LIST** | Click Call History row | **CHAT** | `translate3d(0, 0, 0)` on `drawer-middle` (Call Info) |
| **CHAT** | Click injected Back button | **LIST** | `translate3d(0, 0, 0)` on `#pane-side` or `drawer-left` |
| **CHAT** | Click Close button (Call Info / Camera / Attachment preview) | **LIST** (Calls) / **CHAT** (Composer) | Returns to previous context |
| **CHAT** | Click chat header avatar / title | **INFO** | `translate3d(0, 0, 0)` on `drawer-right` (full content width) |
| **INFO** | Click Close button (`[data-testid="drawer-right"] button[aria-label="Close"]`) | **CHAT** | `drawer-right` slides off-screen, `#main` returns |
| **ANY** | Click active rail button (`aria-pressed="true"`) | **LIST** $\leftrightarrow$ **CHAT** | Toggles between current chat and list (staying in list for Communities) |
| **ANY** | Click different rail button (`aria-pressed="false"`) | **LIST** | Destination section always opens in List view |

### 7.3 Verification Checklist (Live Session)
- [x] Smooth 60fps GPU transforms on view change with zero virtualized list relayout stutter.
- [x] Navigation rail pinned cleanly at `w: 64px` without jitter.
- [x] Back button injected before display picture circle in `#main header` with native SVG path.
- [x] Fullscreen info drawer (`drawer-right`) occupying `calc(100% - 64px)`.
- [x] Middle drawer (Camera capture, Media editor, Attachment preview, Call Info) expanding to full content width.
- [x] Floating Emoji/GIFs/Stickers flyout panel pinned to `x: 68px` and responsively constrained (`width: min(560px, calc(100vw - 76px))`).
- [x] Attachment popover menu (`div.xu96u03[style*="-50%, -100%)"]`) positioned at `x: 68.4px` clear of the 64px rail.
- [x] Main screen horizontal scroll permanently locked to `0` (`lockMainScreenScroll`), completely resolving the community group column-sliding bug.
- [x] Multi-level Communities navigation (Top-level -> Navigation Drawer -> Sub-group Chat -> Back) functioning without stuck states.
- [x] Fullscreen profile photo & media lightbox overlays (`.app-wrapper-web > span:has(> div)`) elevated to `z-index: 1000`, cleanly sitting on top of the 64px navigation rail without cutoff.


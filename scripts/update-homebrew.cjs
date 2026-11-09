const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const REPO = 'ilamparithi-in/WAllie';
const TAP_REPO = 'ilamparithi-in/homebrew-tap';

function runGh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

function resolveAssetSha(asset) {
  if (asset.digest && asset.digest.startsWith('sha256:')) {
    return asset.digest.replace(/^sha256:/, '');
  }
  console.log(`[Homebrew Updater] Downloading ${asset.name} to compute SHA256...`);
  const buffer = execFileSync('curl', ['-sL', asset.url], { maxBuffer: 500 * 1024 * 1024 });
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function main() {
  const targetTagArg = process.argv[2] ? process.argv[2].trim() : '';
  const targetCaskArg = (process.argv[3] || process.env.CASK_NAME || 'wallie').trim();
  const isNightly = targetCaskArg.includes('nightly') || targetTagArg === 'nightly';

  console.log(`[Homebrew Updater] Checking release for ${REPO} ${targetTagArg ? `(${targetTagArg})` : '(latest)'}...`);
  
  let releaseJson;
  try {
    const args = ['release', 'view', '--repo', REPO, '--json', 'tagName,assets'];
    if (targetTagArg) {
      args.splice(2, 0, targetTagArg);
    }
    releaseJson = JSON.parse(runGh(args));
  } catch (err) {
    console.error(`Failed to fetch release info via gh CLI:`, err.message);
    process.exit(1);
  }

  const tagName = releaseJson.tagName;
  const version = tagName.replace(/^v/, '');
  console.log(`[Homebrew Updater] Target release: ${tagName} (v${version})`);

  let armAsset, intelAsset;
  if (isNightly) {
    armAsset = releaseJson.assets.find(a => a.name === 'WAllie-nightly-arm64.dmg' || a.name.includes('arm64.dmg'));
    intelAsset = releaseJson.assets.find(a => a.name === 'WAllie-nightly.dmg' || (a.name.endsWith('.dmg') && !a.name.includes('arm64')));
  } else {
    armAsset = releaseJson.assets.find(a => a.name === `WAllie-${version}-arm64.dmg`);
    intelAsset = releaseJson.assets.find(a => a.name === `WAllie-${version}.dmg`);
  }

  if (!armAsset || !intelAsset) {
    console.error(`Could not find both arm64 and intel dmg assets in ${tagName}`);
    process.exit(1);
  }

  const armSha = resolveAssetSha(armAsset);
  const intelSha = resolveAssetSha(intelAsset);

  console.log(`  ARM64 SHA256: ${armSha}`);
  console.log(`  Intel SHA256: ${intelSha}`);

  const caskFile = `Casks/${targetCaskArg}.rb`;
  const urlDownloadPath = isNightly
    ? `https://github.com/${REPO}/releases/download/${tagName}/WAllie-nightly#{arch}.dmg`
    : `https://github.com/${REPO}/releases/download/v#{version}/WAllie-#{version}#{arch}.dmg`;

  const caskContent = `cask "${targetCaskArg}" do
  arch arm: "-arm64", intel: ""

  version "${version}"
  sha256 arm:   "${armSha}",
         intel: "${intelSha}"

  url "${urlDownloadPath}"
  name "WAllie"
  desc "WhatsApp desktop client with multi-account and extensions support"
  homepage "https://github.com/${REPO}"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: :ventura

  app "WAllie.app"

  zap trash: [
    "~/Library/Application Support/WAllie",
    "~/Library/Application Support/wallie",
    "~/Library/Preferences/dev.ilamparithi.wallie.plist",
    "~/Library/Saved Application State/dev.ilamparithi.wallie.savedState",
  ]

  caveats <<~EOS
    #{token} is not signed with an Apple Developer certificate.
    If macOS blocks opening the app, run:
      xattr -d com.apple.quarantine /Applications/WAllie.app
    Or reinstall using:
      brew install --cask --no-quarantine ilamparithi-in/tap/#{token}
  EOS
end
`;

  console.log(`[Homebrew Updater] Checking current file SHA in ${TAP_REPO}/${caskFile}...`);
  let currentSha = '';
  try {
    currentSha = runGh(['api', `repos/${TAP_REPO}/contents/${caskFile}`, '-q', '.sha']);
  } catch (e) {
    console.log(`File does not exist yet or error:`, e.message);
  }

  const base64Content = Buffer.from(caskContent).toString('base64');
  const payload = {
    message: `chore(cask): update ${targetCaskArg} to ${isNightly ? 'nightly' : `v${version}`}`,
    content: base64Content,
    branch: 'main'
  };
  if (currentSha) {
    payload.sha = currentSha;
  }

  const tempPayload = path.join(os.tmpdir(), `homebrew-payload-${Date.now()}.json`);
  fs.writeFileSync(tempPayload, JSON.stringify(payload), { mode: 0o600 });

  try {
    console.log(`[Homebrew Updater] Committing update to ${TAP_REPO}/${caskFile}...`);
    runGh(['api', '-X', 'PUT', `repos/${TAP_REPO}/contents/${caskFile}`, '--input', tempPayload]);
    console.log(`[Homebrew Updater] Successfully updated ${TAP_REPO}/${caskFile}!`);
  } finally {
    if (fs.existsSync(tempPayload)) {
      fs.unlinkSync(tempPayload);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

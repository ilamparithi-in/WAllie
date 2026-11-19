import React, { useState } from 'react';
import { Modal } from './Modal';

interface DisclaimerModalProps {
  isOpen: boolean;
  isFirstLaunch: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
}

export const DisclaimerModal: React.FC<DisclaimerModalProps> = ({
  isOpen,
  isFirstLaunch,
  onAccept,
  onDecline,
  onClose,
}) => {
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);

  return (
    <Modal
      id="disclaimer"
      isOpen={isOpen}
      onClose={onClose}
      disableClose={isFirstLaunch}
      closeOnBackdropClick={!isFirstLaunch}
      closeOnEscape={!isFirstLaunch}
      showCloseButton={!isFirstLaunch}
      backdropClassName="fixed inset-0 z-50 flex items-center justify-center bg-[#0b141a]/95 select-text font-sans p-4 bg-[radial-gradient(ellipse_at_center,rgba(0,168,132,0.12),transparent_70%)]"
      className="bg-[#222e35]/95 backdrop-blur-md border border-[#2c3943]/80 w-full max-w-2xl rounded-2xl shadow-2xl p-7 flex flex-col max-h-[90vh] overflow-hidden"
      ariaLabelledBy="disclaimer-dialog-title"
    >
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#111b21]/50 border border-[#2c3943]/60 flex items-center justify-center mx-auto mb-3 overflow-hidden p-2.5 shadow-lg">
          <img src="./icon.png" alt="WAllie Logo" className="w-full h-full object-contain" />
        </div>
        <h2 id="disclaimer-dialog-title" className="text-lg font-bold text-[#e9edef] tracking-wide">
          Legal Disclaimer
        </h2>
        <p className="text-[11px] text-[#8696a0] mt-0.5">WAllie - Unofficial WhatsApp Desktop Client</p>
      </div>

      {/* Scrollable Terms Content */}
      <div className="flex-1 overflow-y-auto bg-[#111b21]/70 border border-[#222d34] rounded-xl p-5 my-4 text-xs text-[#8696a0] leading-relaxed space-y-4 pr-3 select-text">
        <div>
          <h4 className="font-bold text-[#e9edef] mb-1">1. Acceptance of Terms</h4>
          <p>
            By using WAllie (the "Application"), you agree to be bound by this legal disclaimer. If you do not agree to these terms, you must immediately decline and terminate the use of this Application.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-[#e9edef] mb-1">2. Unofficial Client Status</h4>
          <p>
            WAllie is an unofficial, third-party client for WhatsApp. It is not affiliated, associated, authorized, endorsed by, or in any way officially connected with WhatsApp LLC, Meta Platforms, Inc., or any of their affiliates. The official WhatsApp service can be found at{' '}
            <a href="https://whatsapp.com" target="_blank" rel="noopener noreferrer" className="text-[#00a884] hover:underline">
              https://whatsapp.com
            </a>
            . "WhatsApp" and all related trademarks, names, and logos are the property of Meta Platforms, Inc.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-[#e9edef] mb-1">3. Limitation of Liability</h4>
          <p>
            The Application is provided "AS IS", without warranty of any kind, express or implied. Under no circumstances shall the developer, contributors, or copyright holders of WAllie be liable for any direct, indirect, incidental, special, consequential, or punitive damages, including but not limited to:
          </p>
          <ul className="list-disc pl-5 mt-1.5 space-y-1">
            <li>Any issues with your connection to or availability of the WhatsApp Web service.</li>
            <li>Data loss, corruption, or leakages.</li>
            <li>Any damages resulting from software errors, crashes, or security vulnerabilities.</li>
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-[#e9edef] mb-1">4. Terms of Service</h4>
          <p>
            WAllie acts strictly as a web wrapper for the official WhatsApp Web application. The Application does not contain any automated bots, scraping scripts, spamming features, or policy-violating tools. Users are solely responsible for ensuring their usage of the application complies with WhatsApp's Terms of Service.
          </p>
        </div>

        <div>
          <h4 className="font-bold text-[#e9edef] mb-1">5. Third-Party Extensions & Custom CSS</h4>
          <p>
            WAllie allows the loading of third-party Chrome extensions and custom stylesheets (CSS). The developer of this Application has no control over, and assumes no responsibility for, the code, privacy policies, or actions of any third-party extensions or custom scripts you choose to import. You are solely responsible for verifying the safety of any custom code or extension you load.
          </p>
        </div>
      </div>

      {/* Footer */}
      {isFirstLaunch ? (
        <div className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer group mt-1 select-none text-left">
            <input
              type="checkbox"
              checked={disclaimerChecked}
              onChange={(e) => setDisclaimerChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-[#2c3943] bg-[#111b21] text-[#00a884] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#00a884]"
            />
            <span className="text-[11px] text-[#8696a0] group-hover:text-[#e9edef] transition-colors leading-normal select-text">
              I acknowledge that WAllie is an unofficial wrapper for WhatsApp Web, and I agree that the developer of this application is not responsible for any operations, actions, or consequences of my usage.
            </span>
          </label>

          <div className="flex gap-3 justify-end border-t border-[#2c3943]/60 pt-4">
            <button
              onClick={onDecline}
              onMouseDown={(e) => e.preventDefault()}
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-[#2a3942] hover:bg-[#3d4f5c] text-[#ea4335] hover:text-[#ff6b6b] transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#ea4335] focus-visible:outline-none"
            >
              Decline & Exit
            </button>
            <button
              onClick={onAccept}
              onMouseDown={(e) => e.preventDefault()}
              disabled={!disclaimerChecked}
              className={`px-6 py-2 rounded-lg text-xs font-bold text-[#111b21] transition-all duration-200 flex items-center gap-1.5 shadow-lg focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none ${
                disclaimerChecked
                  ? 'bg-[#00a884] hover:bg-[#00c298] hover:shadow-[#00a884]/20 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0'
                  : 'bg-[#00a884]/40 text-[#111b21]/50 cursor-not-allowed'
              }`}
            >
              Accept & Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end border-t border-[#2c3943]/60 pt-4">
          <button
            onClick={onClose}
            onMouseDown={(e) => e.preventDefault()}
            className="px-6 py-2 rounded-lg text-xs font-semibold bg-[#00a884] hover:bg-[#00c298] text-[#111b21] transition-all duration-200 shadow-md cursor-pointer focus-visible:ring-2 focus-visible:ring-[#00a884] focus-visible:outline-none"
          >
            Close Disclaimer
          </button>
        </div>
      )}
    </Modal>
  );
};

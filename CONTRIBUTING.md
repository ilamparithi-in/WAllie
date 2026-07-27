# Contributing to WAllie

Thank you for your interest in contributing to WAllie! Contributions from the community help make this application better for everyone.

Please take a moment to review this document before submitting your pull request or opening an issue.

---

## Code of Conduct

By participating in this project, you agree to maintain a respectful, welcoming, and collaborative environment. Be polite, constructive, and helpful.

---

## How Can I Contribute?

### 1. Reporting Bugs
If you find a bug, please check the [GitHub Issues](https://github.com/ilamparithi-in/WAllie/issues) to ensure it hasn't already been reported. If it is new, open a new issue and include:
- A clear, descriptive title.
- Steps to reproduce the issue.
- Expected vs. actual behavior.
- Relevant logs or screenshots.
- Your environment details (Linux distro, desktop environment like GNOME/KDE, Node.js version).

### 2. Suggesting Enhancements
If you have ideas to improve WAllie:
- Open a feature request issue.
- Describe the feature, why it is needed, and how it should behave.
- Provide mockup layouts or code references if available.

### 3. Submitting Pull Requests (PRs)
Ready to write some code? 
1. **Fork** the repository and create your branch from `main`:
   ```bash
   git checkout -b feature/my-amazing-feature
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Make your changes**. Ensure your code is clean, well-commented, and implements robust error handling.
4. **Typecheck & Build**. Ensure there are no compilation warnings:
   ```bash
   # Verify TypeScript types compiles cleanly
   npm run typecheck
   
   # Verify production build passes
   npm run build
   ```
5. **Commit your changes** with descriptive commit messages.
6. **Push to your fork** and open a Pull Request targeting WAllie's `main` branch.

---

## Code Style & Guidelines

- **TypeScript**: We use TypeScript strictly for both the main and renderer processes. Avoid using `any` types where possible.
- **Component Design**: Keep React components modular and reusable. Place styling tokens in the styling system.
- **IPC Communication**: Keep Electron main process and preload bridging IPC APIs clean, safe, and context-isolated.
- **No Placeholders**: Avoid committing placeholder code or unused dependencies.

Thank you again for contributing! Your help keeps WAllie running smoothly on Linux desktops.

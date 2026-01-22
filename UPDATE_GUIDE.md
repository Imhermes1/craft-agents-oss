# How to Update Craft Agent Custom

To update your custom version of the app with the latest changes from the original repository, follow these steps:

### 🚀 The Update Command
Run this command in the root directory of the project to pull new code, merge it, and build a new installer:

```bash
git fetch upstream && git merge upstream/main && bun run electron:dist:mac
```

### 📥 After the Build Finishes:
1.  **Open the release folder**:
    ```bash
    open apps/electron/release
    ```
2.  **Install the update**:
    *   Double-click `Craft-Agent-Custom-arm64.dmg`.
    *   Drag the app to your **Applications** folder.
    *   Choose **"Replace"** when prompted.

### 🛡️ If you get a "Developer not verified" error:
1.  Right-click the app in your Applications folder and select **Open**.
2.  Or run this in the terminal:
    ```bash
    xattr -cr /Applications/"Craft Agent Custom.app"
    ```

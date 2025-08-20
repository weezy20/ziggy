# Ziggy

A fast, ez to use, Zig programming language installer and version manager powered by Bun.

## Usage

First install a `zig` following the prompts: 

```bash
# TODO:
bunx ziggy
```
Or if you clone this repo: 

```bash
# Install dependencies
bun install

# Run the app
bun start
```
Or if you want to install a binary into your system

```bash
# Build and install the binary globally
bun run build
bun install -g
```

Ziggy will guide you through:
- Downloading the latest stable or development Zig verion 
- Downloading a specific Zig version as available on ziglang.org/download
- Switching between zig versions
- Cleaning up unused zig installations


Ziggy also takes into account any system-wide zig installations you might have and those are not mutated in anyway. Ziggy lives at the `ZIGGY_DIR` environment variable which is set to `~/.ziggy` by default. Ziggy will only mutate contents of this folder so you don't have to manage it manually.

To start using Zig binaries provided by Ziggy all you need to do is after after downloading a specific version using ziggy add `source ~/.ziggy/env` or `source $ZIGGY_DIR/env` to your shell profile such as `.bashrc` or `.zshrc`. This file appends the ziggy managed `bin` folder to the current `$PATH` environment variable. This file is only generated after you download a zig using ziggy. 

For PowerShell users, add the following to your PowerShell profile:
```powershell
# Add to your PowerShell profile (usually located at $PROFILE)
. "$env:USERPROFILE\.ziggy\env.ps1"
```

For Command Prompt users, you'll need to manually add the Zig binary path to your system PATH environment variable through System Properties > Environment Variables, or run:
```cmd
set PATH=%USERPROFILE%\.ziggy\bin;%PATH%
```

## Uninstallation
Ziggy doesn't install anything on your system except the contents of `ZIGGY_DIR`. You can delete the folder and be done with it.
# Ziggy

A fast, ez to use, Zig programming language installer and version manager powered by Bun.

## Prerequisites: 
[bun](https://bun.com/)

## Usage

First install a zig of your choice following the prompts. By default ziggy works with this folder `$HOME/.ziggy` but you can specify a different path with `ZIGGY_DIR` env var. 

```bash
# Use without downloading anything
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
bun install
bun run build
# This creates a `ziggy` executable in your cwd that you can put anywhere you want
```

Ziggy also takes into account any system-wide zig installations you might have and those are not mutated in anyway. Ziggy lives at the `ZIGGY_DIR` environment variable which is set to `~/.ziggy` by default. Ziggy will only mutate contents of this folder so you don't have to manage it manually.

To start using Zig binaries provided by Ziggy all you need to do is after  downloading a specific version using ziggy add `source ~/.ziggy/env` or `source $ZIGGY_DIR/env` to your shell profile such as `.bashrc` or `.zshrc`. This file appends the ziggy managed `bin` folder to the current `$PATH` environment variable. This file is only generated after you download a zig using ziggy so sourcing your shell profile before using ziggy might result in an error. 

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
Ziggy doesn't install anything on your system except the contents of `ZIGGY_DIR`. You can delete the folder and be done with it. If you want to clean up zig installations use `ziggy clean`. 
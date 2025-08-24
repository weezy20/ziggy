# Ziggy

A fast, easy to use, Zig programming language installer and version manager powered by Bun.

## Prerequisites: 
- [bun](https://bun.com/)

## Installation

You can install ziggy globally using Bun:

```bash
bun install -g @weezy20/ziggy@latest
```

Or you can use it without installing anything using `bunx`:

```sh
bunx @weezy20/ziggy -h
```

If you want a binary executable you can build it locally 
(Note: the master branch is the development branch and there might be breaking changes):

```sh
bun install && bun build;
./ziggy --help
```

## Usage
Run ziggy to start the interactive TUI to go through the one time setup which well setup a `ZIGGY_DIR` which is where it's managed installations live. By default this is `$HOME/.ziggy` but maybe configured using the environment variable `ZIGGY_DIR`

Here an `env` file will be created which we will need to add to our shell profile (`source ~/.ziggy/env`) in order to make the binaries available in our `PATH`. If you're not sure just follow through the TUI and it'll guide you based upon your operating system. Or you can also run `ziggy setup` for an automated approach.


### Example usage:

```bash
# Start interactive TUI (main interface)
ziggy

# Initialize a new Zig project interactively (TUI)
# Provides two options: the standard zig app template and a barebones app template.
ziggy init                   

# Initialize with a specific project name
ziggy init my-app 

# Switch Zig versions interactively (TUI)
ziggy use

# Switch to a specific version directly
ziggy use 0.14.1              # Switches to Zig 0.14.1 (downloads if not installed)
ziggy use master              # Switches to Zig master branch (downloads if not installed)
ziggy use system              # Switches to system-installed Zig. Ziggy detects any zig installation already in your path and refers to it as `system`

# List all installed Zig versions
ziggy list

# Clean up Ziggy managed installations
ziggy clean

# Setup ziggy environment for current shell
ziggy setup
```

## Commands

- **`ziggy`** - Start the interactive TUI interface
- **`ziggy init [project-name]`** - Create a new Zig project from templates
- **`ziggy use [version]`** - Switch Zig versions (interactive or direct)
- **`ziggy list`** - List installed Zig versions
- **`ziggy clean`** - Clean up Zig installations
- **`ziggy setup`** - Setup shell environment (adds source env to shell profile for PATH)
- **`ziggy sync`** - Resync community mirrors



## Uninstallation
Ziggy doesn't install anything on your system except the contents of `ZIGGY_DIR`. You can delete the folder and be done with it. If you want to clean up specific ziggy managed installations use `ziggy clean`. Ziggy will never do anything with your system zig. 

If you used `bun install -g` to install ziggy then you can use `bun remove -g ziggy` to undo the same.


/**
 * Embedded Barebones Template Content
 * Used as fallback when network is unavailable or cache is invalid
 */

export const BAREBONES_MAIN_ZIG = `pub fn main() !void {}`;

export const BAREBONES_BUILD_ZIG = `const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const exe_mod = b.createModule(.{
        .root_source_file = b.path("main.zig"),
        .target = target,
        .optimize = optimize,
    });
    const exe = b.addExecutable(.{
        .name = "app",
        .root_module = exe_mod,
    });
    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| {
        run_cmd.addArgs(args);
    }
    const run_step = b.step("run", "Run the app");
    run_step.dependOn(&run_cmd.step);
}`;

/**
 * Get all barebones template files as a record
 */
export function getBarebonesTemplate(): Record<string, string> {
  return {
    'main.zig': BAREBONES_MAIN_ZIG,
    'build.zig': BAREBONES_BUILD_ZIG
  };
}
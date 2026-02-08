#!/usr/bin/env python3
"""
Landing Page Safety Pre-commit Hooks
Prevents shipping broken jinyang.ai by protecting critical config files.

Usage:
    python precommit_landing_hooks.py <command>

Commands:
    check-critical-files       - Block if postcss.config.mjs deleted or gutted
    check-next-config-safety   - Block if ignoreBuildErrors added to next.config.ts
    check-css-bundle           - Warn if built CSS < 10KB (Tailwind broken)
"""

import subprocess
import sys
from pathlib import Path


POSTCSS_CONFIG = Path("postcss.config.mjs")
NEXT_CONFIG = Path("next.config.ts")


def check_critical_files() -> int:
    """Block commits that would break Tailwind CSS compilation."""
    errors = []

    # Check if postcss.config.mjs is staged for deletion
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=D"],
            capture_output=True,
            text=True,
            check=True,
        )
        deleted_files = result.stdout.strip().splitlines()
        if "postcss.config.mjs" in deleted_files:
            errors.append(
                "postcss.config.mjs is staged for DELETION.\n"
                "   This file is REQUIRED for Tailwind CSS compilation.\n"
                "   Without it, all styles disappear (46KB -> 4KB)."
            )
    except subprocess.CalledProcessError:
        pass

    # Check if postcss.config.mjs exists and still has the required plugin
    if POSTCSS_CONFIG.exists() and "postcss.config.mjs" not in (
        subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=D"],
            capture_output=True,
            text=True,
        )
        .stdout.strip()
        .splitlines()
    ):
        # Check staged version if modified, otherwise check working copy
        staged = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            capture_output=True,
            text=True,
        )
        if "postcss.config.mjs" in staged.stdout:
            # Read the staged version
            result = subprocess.run(
                ["git", "show", ":postcss.config.mjs"],
                capture_output=True,
                text=True,
            )
            content = result.stdout
        else:
            content = POSTCSS_CONFIG.read_text()

        if "@tailwindcss/postcss" not in content:
            errors.append(
                "postcss.config.mjs no longer contains '@tailwindcss/postcss'.\n"
                "   This plugin is REQUIRED for Tailwind CSS v4 compilation.\n"
                "   Without it, all styles disappear."
            )

    if errors:
        print("BLOCKED - Critical config protection:", file=sys.stderr)
        for err in errors:
            print(f"\n   {err}", file=sys.stderr)
        print(
            "\n   To bypass in emergencies: git commit --no-verify",
            file=sys.stderr,
        )
        return 1

    return 0


def check_next_config_safety() -> int:
    """Block commits that add ignoreBuildErrors to next.config.ts."""
    if not NEXT_CONFIG.exists():
        return 0

    # Check the staged version if it's been modified
    staged = subprocess.run(
        ["git", "diff", "--cached", "--name-only"],
        capture_output=True,
        text=True,
    )
    if "next.config.ts" in staged.stdout:
        result = subprocess.run(
            ["git", "show", ":next.config.ts"],
            capture_output=True,
            text=True,
        )
        content = result.stdout
    else:
        content = NEXT_CONFIG.read_text()

    if "ignoreBuildErrors" in content:
        print(
            "BLOCKED - next.config.ts contains 'ignoreBuildErrors'.\n"
            "   This silences real build failures and ships broken code.\n"
            "   Fix the actual build error instead.\n"
            "\n"
            "   To bypass in emergencies: git commit --no-verify",
            file=sys.stderr,
        )
        return 1

    return 0


def check_css_bundle() -> int:
    """Warn if built CSS bundle is suspiciously small (Tailwind not compiling)."""
    css_dir = Path(".next/static/chunks")
    if not css_dir.exists():
        print("No .next build found. Run 'npm run build' first.", file=sys.stderr)
        return 0  # Don't block, just inform

    css_files = list(css_dir.glob("*.css"))
    if not css_files:
        print(
            "WARNING: No CSS files found in .next/static/chunks/.\n"
            "   Tailwind CSS may not be compiling.",
            file=sys.stderr,
        )
        return 0  # Warn only

    total_size = sum(f.stat().st_size for f in css_files)
    total_kb = total_size / 1024

    if total_kb < 10:
        print(
            f"WARNING: Total CSS bundle is only {total_kb:.1f}KB.\n"
            "   Expected ~46KB+ with Tailwind CSS.\n"
            "   This likely means Tailwind is NOT compiling.\n"
            "   Check postcss.config.mjs and globals.css.",
            file=sys.stderr,
        )
        return 1  # Block - this is a strong signal of breakage

    print(f"CSS bundle size: {total_kb:.1f}KB (OK)")
    return 0


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    command = sys.argv[1]

    if command == "check-critical-files":
        return check_critical_files()
    elif command == "check-next-config-safety":
        return check_next_config_safety()
    elif command == "check-css-bundle":
        return check_css_bundle()
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        print(__doc__)
        return 1


if __name__ == "__main__":
    sys.exit(main())

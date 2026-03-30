import glob
import os
import shutil
import signal
import subprocess
from datetime import datetime
from pathlib import Path

from django.core.management.base import BaseCommand


def _is_wayland():
    return bool(os.environ.get("WAYLAND_DISPLAY"))


def _find_dri_card():
    cards = sorted(glob.glob("/dev/dri/card*"))
    return cards[0] if cards else None


class Command(BaseCommand):
    help = "Record the screen into an MKV file for later match video processing"

    def add_arguments(self, parser):
        parser.add_argument(
            "output_name",
            type=str,
            nargs="?",
            default="",
            help="Output filename (without extension). Defaults to timestamped name.",
        )
        parser.add_argument(
            "--output-dir",
            type=str,
            default="",
            help="Directory to save the recording (default: match_videos/recordings/)",
        )
        parser.add_argument(
            "--framerate",
            type=int,
            default=30,
            help="Recording framerate (default: 30)",
        )
        parser.add_argument(
            "--no-audio",
            action="store_true",
            help="Disable audio recording",
        )
        parser.add_argument(
            "--crf",
            type=int,
            default=23,
            help="Video quality CRF value (0=lossless, 51=worst, default: 23)",
        )
        parser.add_argument(
            "--display",
            type=str,
            default="",
            help="X11 display to capture (default: $DISPLAY). X11 only.",
        )
        parser.add_argument(
            "--resolution",
            type=str,
            default="",
            help="Recording resolution WxH (default: full screen). X11 only.",
        )
        parser.add_argument(
            "--card",
            type=str,
            default="",
            help="DRI card device for kmsgrab (default: auto-detect, e.g. /dev/dri/card1). Wayland only.",
        )

    def handle(self, *args, **options):
        if options["output_dir"]:
            output_dir = Path(options["output_dir"])
        else:
            project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
            output_dir = project_root / "match_videos" / "recordings"

        output_dir.mkdir(parents=True, exist_ok=True)

        output_name = options["output_name"]
        if not output_name:
            output_name = datetime.now().strftime("recording_%Y%m%d_%H%M%S")

        output_path = output_dir / f"{output_name}.mkv"

        if output_path.exists():
            self.stdout.write(self.style.ERROR(f"File already exists: {output_path}"))
            return

        framerate = options["framerate"]
        no_audio = options["no_audio"]
        crf = options["crf"]

        self.stdout.write(self.style.SUCCESS("\n=== Screen Recording ==="))
        self.stdout.write(f"Output:    {output_path}")
        self.stdout.write(f"Framerate: {framerate} fps")
        self.stdout.write(f"Audio:     {'disabled' if no_audio else 'enabled'}")

        if _is_wayland():
            cmd = self._build_wayland_cmd(output_path, framerate, no_audio)
        else:
            cmd = self._build_x11_cmd(output_path, framerate, no_audio, crf, options)

        if cmd is None:
            return

        self.stdout.write("\nPress Ctrl+C to stop recording.\n")

        proc = None
        try:
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
            proc.wait()
        except KeyboardInterrupt:
            self.stdout.write("\nStopping recording...")
            if proc is not None:
                try:
                    proc.send_signal(signal.SIGINT)
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()

        if output_path.exists() and output_path.stat().st_size > 0:
            size_mb = output_path.stat().st_size / (1024 * 1024)
            self.stdout.write(
                self.style.SUCCESS(f"\n✓ Recording saved: {output_path} ({size_mb:.1f} MB)")
            )
        else:
            self.stdout.write(self.style.ERROR("\n✗ Recording failed or produced empty file"))

    def _build_wayland_cmd(self, output_path, framerate, no_audio):
        # wl-screenrec supports KDE Plasma 6 (ext-image-capture-source-v1)
        if shutil.which("wl-screenrec"):
            self.stdout.write("Backend:   wl-screenrec (Wayland/KDE)")
            cmd = ["wl-screenrec", "--filename", str(output_path)]
            if not no_audio:
                cmd += ["--audio"]
            return cmd

        # wf-recorder supports wlroots-based compositors / older KDE
        if shutil.which("wf-recorder"):
            self.stdout.write("Backend:   wf-recorder (Wayland)")
            cmd = ["wf-recorder", "-f", str(output_path)]
            if no_audio:
                cmd += ["--no-audio"]
            return cmd

        self.stdout.write(self.style.ERROR(
            "No Wayland screen recorder found.\n"
            "For KDE Plasma 6, install wl-screenrec:\n"
            "  yay -S wl-screenrec\n"
            "For wlroots compositors (Sway, Hyprland):\n"
            "  sudo pacman -S wf-recorder"
        ))
        return None

    def _build_kmsgrab_cmd(self, output_path, framerate, no_audio, crf, options):
        card = options["card"] or _find_dri_card()
        if not card or not Path(card).exists():
            self.stdout.write(self.style.ERROR(
                f"DRI card not found: {card}\n"
                "Specify one with --card /dev/dri/cardN"
            ))
            return None

        if not os.access(card, os.R_OK):
            self.stdout.write(self.style.ERROR(
                f"No read access to {card}.\n"
                "Add yourself to the video group:  sudo usermod -aG video $USER\n"
                "Then log out and back in."
            ))
            return None

        self.stdout.write(f"Backend:   ffmpeg kmsgrab (Wayland, sudo)")
        self.stdout.write(f"Device:    {card}")

        cmd = [
            "sudo", "ffmpeg",
            "-device", card,
            "-f", "kmsgrab",
            "-framerate", str(framerate),
            "-i", "-",
            "-vf", "hwdownload,format=bgr0,format=yuv420p",
        ]

        if not no_audio:
            cmd += ["-f", "pulse", "-i", "default"]

        cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", str(crf)]
        if not no_audio:
            cmd += ["-c:a", "aac"]

        cmd += [str(output_path), "-y"]
        return cmd

    def _build_x11_cmd(self, output_path, framerate, no_audio, crf, options):
        display = options["display"] or os.environ.get("DISPLAY", ":0.0")
        resolution = options["resolution"]

        self.stdout.write(f"Backend:   ffmpeg x11grab (X11)")
        self.stdout.write(f"Display:   {display}")
        if resolution:
            self.stdout.write(f"Resolution: {resolution}")

        cmd = ["ffmpeg", "-f", "x11grab", "-framerate", str(framerate)]
        if resolution:
            cmd += ["-video_size", resolution]
        cmd += ["-i", display]

        if not no_audio:
            cmd += ["-f", "pulse", "-i", "default"]

        cmd += ["-c:v", "libx264", "-preset", "ultrafast", "-crf", str(crf)]
        if not no_audio:
            cmd += ["-c:a", "aac"]

        cmd += [str(output_path), "-y"]
        return cmd

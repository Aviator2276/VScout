import os

os.environ["OMP_THREAD_LIMIT"] = "1"
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

import ffmpeg
import pytesseract
from PIL import Image

redX: int = 30
redY: int = 24
redW: int = 18
redH: int = 10

blueX: int = 582
blueY: int = 24
blueW: int = 18
blueH: int = 10

rootPath: str = os.path.dirname(os.path.abspath(__file__))
videoDir: str = rootPath + "/matches/"
fps: int = 1
frame2sec = lambda frameNo, fps: frameNo / fps


def crop_video(filename):
    file = videoDir + filename
    probe = ffmpeg.probe(file)

    os.makedirs(
        rootPath + "/match_images/" + filename.rsplit(".", 1)[0] + "/blue/",
        exist_ok=True,
    )
    os.makedirs(
        rootPath + "/match_images/" + filename.rsplit(".", 1)[0] + "/red/",
        exist_ok=True,
    )

    contrast: int = 255  # all values either 255 or 0
    sat: int = 0  # remove color
    fmat: str = "image2"
    pix_fmt: str = "yuvj420p"
    out = [None, None]
    expr = "gt(p(X,Y),128)*255"
    out[0], err = (
        ffmpeg.input(file)
        .crop(redX, redY, redW, redH)
        .filter("scale", redW * 32, redH * 32)
        .filter("fps", fps=fps)
        # .filter("format", "gray")
        # .filter("negate")
        # .filter("eq", **{"contrast": contrast})
        # .filter("hue", s=0)
        # .filter("geq", r=expr, g=expr, b=expr)
        # .output('pipe:', format='image2pipe', pix_fmt='rgb0')
        # .run(capture_stdout=True)
        .output(
            rootPath + "/match_images/" + filename.rsplit(".", 1)[0] + "/red/%03d.jpg",
            format=fmat,
            pix_fmt=pix_fmt,
        )
        .overwrite_output()
        .run()
    )
    out[1], err = (
        ffmpeg.input(file)
        .crop(blueX, blueY, blueW, blueH)
        .filter("scale", blueW * 32, blueH * 32)
        .filter("fps", fps=fps)
        # .filter("format", "gray")
        # .filter("negate")
        # .filter("eq", **{"contrast": contrast})
        # .filter("hue", s=0)
        # .filter("geq", r=expr, g=expr, b=expr)
        # .output('pipe:', format='image2pipe', pix_fmt='rgb0')
        # .run(capture_stdout=True)
        .output(
            rootPath + "/match_images/" + filename.rsplit(".", 1)[0] + "/blue/%03d.jpg",
            format=fmat,
            pix_fmt=pix_fmt,
        )
        .overwrite_output()
        .run()
    )
    return out  # output isnt used lol


if __name__ == "__main__":
    videoDir = os.path.join(rootPath, "../../match_videos/2026week0/")
    filename = "match_qualification_15_day1.mp4"
    crop_video(filename)

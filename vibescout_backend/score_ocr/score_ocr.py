import concurrent.futures
import json
import os
import re

import ffmpeg
import pytesseract
from PIL import Image, ImageOps

os.environ["OMP_THREAD_LIMIT"] = "1"  # disable tesseracts internal threading


# TODO: remove cropping when caleb pushes new vid code
# TODO: beat bryan with a rock
# TODO: run tesseract without wrapper for significantly reduced IO overhead

redX = 640
redY = 970
redW = 180
redH = 100

blueX = 1100
blueY = 970
blueW = 180
blueH = 100

rootPath = os.path.dirname(os.path.abspath(__file__))
videoDir = rootPath + "/matches/"
fps = 15
frame2sec = lambda frameNo, fps: frameNo / fps


def crop_video(filename):
    file = videoDir + filename
    probe = ffmpeg.probe(file)

    os.makedirs(
        rootPath + "/" + filename.rsplit(".", 1)[0] + "/" + "blue/", exist_ok=True
    )
    os.makedirs(
        rootPath + "/" + filename.rsplit(".", 1)[0] + "/" + "red/", exist_ok=True
    )

    contrast = 255  # all values either 255 or 0
    sat = 0  # remove color
    fmat = "image2"
    pix_fmt = "yuvj420p"
    out = [None, None]
    out[0], err = (
        ffmpeg.input(file)
        .crop(redX, redY, redW, redH)
        .filter("fps", fps=fps)
        .filter("eq", **{"contrast": contrast})
        .filter("hue", s=0)
        # .output('pipe:', format='image2pipe', pix_fmt='rgb0')
        # .run(capture_stdout=True)
        .output(
            rootPath + "/" + filename.rsplit(".", 1)[0] + "/red/%03d.jpg",
            format=fmat,
            pix_fmt=pix_fmt,
        )
        .run()
    )
    out[1], err = (
        ffmpeg.input(file)
        .crop(blueX, blueY, blueW, blueH)
        .filter("fps", fps=fps)
        .filter("eq", **{"contrast": contrast})
        .filter("hue", s=0)
        # .output('pipe:', format='image2pipe', pix_fmt='rgb0')
        # .run(capture_stdout=True)
        .output(
            rootPath + "/" + filename.rsplit(".", 1)[0] + "/blue/%03d.jpg",
            format=fmat,
            pix_fmt=pix_fmt,
        )
        .run()
    )
    return out  # output isnt used lol


def ocrThread(imageName, path):
    frameNo = int(imageName[:-4:])
    image = Image.open(path + "/" + imageName)
    text = re.sub(
        r"\D",
        "",
        pytesseract.image_to_string(
            image,
            lang="eng",
            config=r"--oem 3 --psm 6 -c tessedit_char_whitelist=0123456789",
        ),
    )
    try:
        text = int(text)
    except:
        text = -1
    return frameNo, text


if __name__ == "__main__":
    matchData = {}

    for file in os.listdir(videoDir):
        if not file.endswith(".m4v"):
            continue
        result = crop_video(file)
        frameDir = rootPath + "/" + file.rsplit(".", 1)[0]
        intlist = {"red": {}, "blue": {}}
        redFutures = []
        blueFutures = []
        with concurrent.futures.ProcessPoolExecutor() as executor:
            for imageFile in os.listdir(frameDir + "/red"):
                redFutures.append(
                    executor.submit(ocrThread, imageFile, frameDir + "/red/")
                )
            for imageFile in os.listdir(frameDir + "/blue"):
                blueFutures.append(
                    executor.submit(ocrThread, imageFile, frameDir + "/blue/")
                )
            for future in concurrent.futures.as_completed(redFutures):
                frameNo, score = future.result()
                intlist["red"][frameNo] = score
            print("red OCR finished")
            for future in concurrent.futures.as_completed(blueFutures):
                frameNo, score = future.result()
                intlist["blue"][frameNo] = score
            print("blue OCR finished")


            for frame in range(2,2690):
                if intlist['blue'][frame] == -1:
                    try:
                        intlist['blue'][frame] = intlist['blue'][frame-1]
                    except:
                        pass
            for frame in range(2,2690):
                if intlist['red'][frame] == -1:
                    try:
                        intlist['red'][frame] = intlist['red'][frame-1]
                    except:
                        pass

            # Sort timestamps for both alliances
            intlist["red"] = dict(sorted(intlist["red"].items()))
            intlist["blue"] = dict(sorted(intlist["blue"].items()))

            matchData[file[:-4:]] = intlist

    with open(rootPath + "/data.json", "w") as f:
        json.dump(matchData, f, indent=4)





# "matchName" : {
#   001 : {
#       "red":0,
#       "blue":0}
#   002 : {
#       "red":0,
#       "blue":0}
#       }}}

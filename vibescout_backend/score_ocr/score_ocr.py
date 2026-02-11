import concurrent.futures
import json
import os
import re

import ffmpeg
import pytesseract
from PIL import Image, ImageOps

os.environ["OMP_THREAD_LIMIT"] = "1"  # disable tesseracts internal threading


# TODO: update cropping when new data is avail
# TODO: beat bryan with a rock
# TODO: run tesseract without wrapper for significantly reduced IO overhead

redX : int = 640
redY : int = 970
redW : int = 180
redH : int = 100

blueX : int = 1100
blueY : int = 970
blueW : int = 180
blueH : int = 100

rootPath : str = os.path.dirname(os.path.abspath(__file__))
videoDir: str = rootPath + "/matches/"
fps : int = 15
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

    contrast : int = 255  # all values either 255 or 0
    sat: int = 0  # remove color
    fmat: str = "image2"
    pix_fmt: str = "yuvj420p"
    out = [None, None]
    expr = 'gt(p(X,Y),128)*255'
    out[0], err = (
        ffmpeg.input(file)
        .crop(redX, redY, redW, redH)
        .filter("fps", fps=fps)
        .filter('format', 'gray')
        .filter('negate')
        .filter("eq", **{"contrast": contrast})
        .filter("hue", s=0)
        .filter('geq', r=expr, g=expr, b=expr) 
        .filter('format', 'monob') 
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
        .filter('format', 'gray')
        .filter('negate')
        .filter("eq", **{"contrast": contrast})
        .filter("hue", s=0)
        .filter('geq', r=expr, g=expr, b=expr) 
        .filter('format', 'monob') 
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


def ocrThread(imageName, path) -> tuple[int,int]:
    frameNo : int = int(imageName[:-4:])
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
        intlist : dict[str,dict[int,int]] = {"red": {}, "blue": {}}
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


            for frame in range(2,len(intlist['blue'].keys())-1):
                if intlist['blue'][frame] == -1:
                    try:
                        intlist['blue'][frame] = intlist['blue'][frame-1]
                    except:
                        pass


            for frame in range(2,len(intlist['red'].keys())-1):
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

for i in range(300,600):
    print(str(i)+' : '+str(matchData[file[:-4:]]['blue'][i]))



# "matchName" : {
#   'red' : {
#       001:0,
#       002:1,}
#   'blue' : {
#       001:0,
#       002:1,}
#       }}}

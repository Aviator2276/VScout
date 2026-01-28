"""
 # Uses the official FMS to get the start time of the first match (actualStartTime) and calculates
 # the time difference between the other match start times to know when the matches starts.
 # Basically subtract the first match start from the other match start times and you get the difference.
 # The only thing you need to do and this scipt doesn't know how to do is get the first match start time.
 # So put that in the python arguments and you will see instant results.
 # 
 # pip install platform yt-dlp
 # Run Examples:
 #     If you didn't convert to base64
 #         python DownloadVideoMatches.py /mnt/f "https://www.youtube.com/watch?v=941HA6kE9JQ" "21:30.10" 25 -u jdthebomb -k <key>
 #     If you did convert to base64
 #     python DownloadVideoMatches.py /mnt/f "https://www.youtube.com/watch?v=941HA6kE9JQ" "21:30.10" 25 -t <token>

 # *****
    Caleb Note: We may want to also install ffmpeg through python
    so that it does not need to be installed on the device. Bryan,
    we'll need to convert this to TBA and also use their match
    schema... Currently, I'm doing modifications like cropping in
    ffmpeg, but eventually I want to pipe this scripts output to
    my current script so it's seamless.
 # *****
"""
import platform
import argparse
import base64
import http.client
import json
from datetime import datetime, timedelta
import yt_dlp
from yt_dlp.utils import download_range_func

parser = argparse.ArgumentParser(prog='myprogram')
parser.add_argument('Folder',type=str)
parser.add_argument('URL',type=str)
parser.add_argument('StartTime',type=str)
parser.add_argument('Matches',type=int)
parser.add_argument('-u', '--User',type=str)
parser.add_argument('-k', '--AuthorizationKey',type=str)
parser.add_argument('-t', "--Token",type=str)
args = parser.parse_args()

def ParseToken(User, AuthorizationKey):
    return base64.urlsafe_b64encode((User+":"+AuthorizationKey).encode("ascii")).decode('ascii')

def GetMatches(token):
    conn = http.client.HTTPSConnection("frc-api.firstinspires.org")
    payload = ''
    headers = {
        'Authorization': 'Basic '+token,   #Decodes and gives you the Base64 in a string.
        'If-Modified-Since': ''
    }

    #Gets the most recent Event Match Results
    conn.request("GET", "/v3.0/2025/matches/ARLI?tournamentLevel=Qualification", payload, headers)
    res = conn.getresponse()
    data = res.read()

    #This is a list containing all the matches that have been played. If only 21 matches have passed then you only get 21 results.
    return json.loads(data.decode("utf-8"))["Matches"]

def DownloadYoutubeVideoClip(url, folder, name, startTime, endTime):
    if platform.system() == "Linux":
        tmp = '/tmp'
    else:
        tmp = 'C\\tmp'
        ydl_opts = {
            'extractor_args': {
                'youtube': {
                    'player_client': ['android'],
                }
        },
        'paths': {
            'home': folder,  # Final file location
            'temp': tmp                  # (Optional) Temporary download location
        },
        'outtmpl': name+'.%(ext)s', #'%(title)s.%(ext)s'
        'format': '137+140/136+140/134+140/18',
        'download_ranges': download_range_func(None, [(startTime,endTime)]),
        'force_keyframes_at_cuts': True,
    }
    
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])


if args.URL and args.StartTime and args.Folder:
    Matches = GetMatches(
        args.Token
        or
        ParseToken(args.User,args.AuthorizationKey)
    )

    StartTime = datetime.strptime(args.StartTime, "%M:%S.%f")
    StartTime = timedelta(minutes=StartTime.minute, seconds=StartTime.second)
    print(StartTime)

    ReferenceTime = Matches[0]["actualStartTime"] = datetime.fromisoformat(Matches[0]["actualStartTime"])

    DownloadYoutubeVideoClip(
        args.URL,
        args.Folder,
        "Match1",
        StartTime.total_seconds(),
        ((datetime.fromisoformat(Matches[0]["postResultTime"]) - ReferenceTime)+StartTime).total_seconds()
    )
    
    download_ranges = []
    for matchNumber in range(1,args.Matches):
        Match = Matches[matchNumber+1]
        print((datetime.fromisoformat(Match["actualStartTime"]) - ReferenceTime)+StartTime)
        DownloadYoutubeVideoClip(
            args.URL,
            args.Folder,
            "Match"+str(matchNumber),
            ((datetime.fromisoformat(Match["actualStartTime"]) - ReferenceTime)+StartTime).total_seconds(),
            ((datetime.fromisoformat(Match["postResultTime"]) - ReferenceTime)+StartTime).total_seconds()
        )
        """
        actualStartTime = Match["actualStartTime"] = datetime.fromisoformat(Match["actualStartTime"])
        Match["actualStartTime"] = (actualStartTime - ReferenceTime)+StartTime
        

        postResultTime = Match["postResultTime"] = datetime.fromisoformat(Match["postResultTime"])
        Match["postResultTime"] = (postResultTime - ReferenceTime)+StartTime
        """
        """
        download_ranges.append(
            [
                (datetime.fromisoformat(Match["actualStartTime"]) - ReferenceTime+StartTime).total_seconds(),
                (datetime.fromisoformat(Match["postResultTime"]) - ReferenceTime+StartTime).total_seconds()
            ]
        )
        """
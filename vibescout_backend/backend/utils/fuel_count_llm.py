import base64
import os
import re
from concurrent.futures import ThreadPoolExecutor

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

_ROOT = os.path.dirname(os.path.abspath(__file__))
_MODEL = os.getenv("LLM_MODEL", "qwen/qwen3-vl-8b-instruct")

_client = OpenAI(
    api_key=os.getenv("LLM"),
    base_url="https://openrouter.ai/api/v1",
)


def _query_image(args: tuple[int, str]) -> tuple[int, str]:
    i, folder_path = args
    file_path = folder_path + f"/{str(i).zfill(3)}.jpg"
    with open(file_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    response = _client.chat.completions.create(
        model=_MODEL,
        messages=[
            {
                "role": "system",
                "content": "You are a machine that looks at blurry number images and only returns what number the image contains.",
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                    },
                    {"type": "text", "text": "What number is in this image?"},
                ],
            },
        ],
    )
    result = response.choices[0].message.content
    first_num = re.search(r'\d+', result)
    print(i, first_num.group() if first_num else result)
    return i, first_num.group() if first_num else "0"


def _scores_from_folder(folder_path: str) -> list[str]:
    with ThreadPoolExecutor(max_workers=8) as ex:
        results = dict(ex.map(_query_image, [(i, folder_path) for i in range(1, 171)]))
    return [results[i] for i in range(1, 171)]


def scores_from_images(match_folder: str) -> dict:
    return {
        "red": _scores_from_folder(match_folder + "/red"),
        "blue": _scores_from_folder(match_folder + "/blue"),
    }


if __name__ == "__main__":
    scores_from_images(os.path.join(_ROOT, "match_images/match_qualification_15_day1"))

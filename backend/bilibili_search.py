from bilibili_api import search, sync
import asyncio


def search_bilibili_courses(keyword, page=1):
    """
    使用 bilibili-api-python 库搜索课程
    """
    try:
        print(f"Searching Bilibili with keyword: {keyword}, page: {page}")

        async def async_search():
            # 搜索视频
            result = await search.search_by_type(
                keyword=keyword,
                search_type=search.SearchObjectType.VIDEO,
                order_type=search.OrderVideo.TOTALRANK,
                page=page
            )
            return result

        result = sync(async_search())

        videos = result.get('result', [])
        print(f"Found {len(videos)} videos")

        if not videos:
            return []

        courses = []
        for video in videos[:10]:  # 限制返回 10 个结果
            courses.append({
                "bvid": video.get("bvid", ""),
                "title": video.get("title", "").replace("<em class=\"keyword\">", "").replace("</em>", ""),
                "platform": "哔哩哔哩",
                "url": f"https://www.bilibili.com/video/{video.get('bvid', '')}",
                "description": video.get("description", "")[:100] + "..." if len(
                    video.get("description", "")) > 100 else video.get("description", ""),
                "author": video.get("author", ""),
                "play": video.get("play", 0),
                "duration": video.get("duration", "")
            })

        return courses

    except Exception as e:
        print(f"Error searching Bilibili: {e}")
        import traceback
        traceback.print_exc()
        return []
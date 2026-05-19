import asyncio
import logging

from database import db
from utils.normalized_fields_backfill import backfill_missing_name_normalized


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("backfill_name_normalized")


async def main() -> None:
    summary = await backfill_missing_name_normalized(db)
    logger.info(
        "backfill complete scanned=%s updated=%s skipped=%s",
        summary["scanned"],
        summary["updated"],
        summary["skipped"],
    )


if __name__ == "__main__":
    asyncio.run(main())

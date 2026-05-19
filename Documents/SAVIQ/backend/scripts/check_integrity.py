import asyncio
import json
import logging

from database import db
from utils.integrity_checks import run_integrity_checks


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("check_integrity")


async def main() -> None:
    summary = await run_integrity_checks(db)
    logger.info("integrity check completed")
    print(json.dumps(summary, default=str, indent=2))


if __name__ == "__main__":
    asyncio.run(main())

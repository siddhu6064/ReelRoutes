import logging
from config import get_settings


class _RequestContextDefaultsFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_method"):
            record.request_method = "-"
        if not hasattr(record, "request_path"):
            record.request_path = "-"
        return True


def configure_logging() -> None:
    root_logger = logging.getLogger()
    if any(getattr(h, "name", "") == "expense_tracker_stream" for h in root_logger.handlers):
        return

    settings = get_settings()
    level = getattr(logging, settings.LOG_LEVEL, logging.INFO)

    handler = logging.StreamHandler()
    handler.name = "expense_tracker_stream"
    handler.setLevel(level)
    handler.addFilter(_RequestContextDefaultsFilter())
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s | %(levelname)s | %(name)s | %(request_method)s %(request_path)s | %(message)s"
        )
    )

    root_logger.setLevel(level)
    root_logger.addHandler(handler)

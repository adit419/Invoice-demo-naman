"""
Background task: polls svc-tools@neoflo.ai for unread 'Invoice Processing' emails
and triggers email ingestion for each PDF attachment found.
"""
import asyncio
import logging

from ..config import settings
from ..services import gmail_client
from ..services.email_ingestion import ingest_from_email

logger = logging.getLogger(__name__)


async def _process_message(message: dict) -> None:
    msg_id = message.get("id", "")
    try:
        full_msg = await gmail_client.get_message(msg_id)
        sender = gmail_client.extract_sender(full_msg)
        if not sender:
            logger.warning("No sender in message %s — marking read and skipping", msg_id)
            await gmail_client.mark_as_read(msg_id)
            return

        pdfs = gmail_client.extract_pdf_attachments(full_msg)
        if not pdfs:
            logger.info("No PDF attachments in message %s — skipping", msg_id)
            await gmail_client.mark_as_read(msg_id)
            return

        for att in pdfs:
            try:
                pdf_bytes = await gmail_client.get_attachment_bytes(msg_id, att["attachment_id"])
                run_id = await ingest_from_email(
                    sender=sender,
                    filename=att["filename"],
                    pdf_bytes=pdf_bytes,
                )
                logger.info("Email ingested: run_id=%s sender=%s file=%s", run_id, sender, att["filename"])
            except Exception:
                logger.exception("Failed to ingest attachment %s from message %s", att["filename"], msg_id)

        await gmail_client.mark_as_read(msg_id)
    except Exception:
        logger.exception("Failed to process message %s", msg_id)


async def gmail_poll_loop() -> None:
    logger.info(
        "Gmail poller started — polling every %ds for %s",
        settings.gmail_poll_interval,
        settings.gmail_target_email,
    )
    while True:
        try:
            messages = await gmail_client.list_unread_invoice_messages()
            if messages:
                logger.info("Found %d unread Invoice Processing email(s)", len(messages))
                for msg in messages:
                    await _process_message(msg)
        except Exception:
            logger.exception("Gmail poll cycle error")
        await asyncio.sleep(settings.gmail_poll_interval)

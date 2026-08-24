"""HTML email templates for bill-posting notification and STP failure."""


def bill_posted_html(
    invoice_number: str,
    vendor_name: str,
    currency: str,
    total_amount: str,
    posted_date: str,
    zoho_reference: str,
    zoho_url: str,
) -> str:
    cta = (
        f'<a href="{zoho_url}" style="display:inline-block;margin-top:24px;padding:12px 28px;'
        f'background:#1570EF;color:#fff;font-weight:600;font-size:14px;border-radius:8px;'
        f'text-decoration:none;">View in Zoho Books</a>'
        if zoho_url else ""
    )
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#0a0e1a;padding:28px 36px;">
          <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Neoflo</span>
          <span style="color:rgba(255,255,255,0.4);font-size:13px;margin-left:10px;">Invoice Processing</span>
        </td></tr>
        <tr><td style="padding:36px;">
          <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Invoice Posted Successfully</h2>
          <p style="margin:0 0 24px;color:#64748b;font-size:14px;">
            Your invoice has been reviewed and posted to our ERP system.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr style="background:#f1f5f9;">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;width:45%;">Field</td>
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Value</td>
            </tr>
            <tr><td style="padding:12px 16px;font-size:14px;color:#475569;border-top:1px solid #e2e8f0;">Bill Number</td>
                <td style="padding:12px 16px;font-size:14px;color:#0f172a;font-weight:600;border-top:1px solid #e2e8f0;">{invoice_number}</td></tr>
            <tr><td style="padding:12px 16px;font-size:14px;color:#475569;border-top:1px solid #e2e8f0;">Vendor</td>
                <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-top:1px solid #e2e8f0;">{vendor_name}</td></tr>
            <tr><td style="padding:12px 16px;font-size:14px;color:#475569;border-top:1px solid #e2e8f0;">Amount</td>
                <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-top:1px solid #e2e8f0;">{currency} {total_amount}</td></tr>
            <tr><td style="padding:12px 16px;font-size:14px;color:#475569;border-top:1px solid #e2e8f0;">Posted Date</td>
                <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-top:1px solid #e2e8f0;">{posted_date}</td></tr>
            <tr><td style="padding:12px 16px;font-size:14px;color:#475569;border-top:1px solid #e2e8f0;">Zoho Reference</td>
                <td style="padding:12px 16px;font-size:14px;color:#1570EF;font-family:monospace;border-top:1px solid #e2e8f0;">{zoho_reference}</td></tr>
          </table>
          {cta}
          <p style="margin:32px 0 0;font-size:12px;color:#94a3b8;">
            This is an automated notification from Neoflo's invoice processing pipeline.
            Please do not reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def directpay_posted_html(
    invoice_number: str,
    vendor_name: str,
    currency: str,
    total_amount: str,
    posted_date: str,
) -> str:
    """Same visual pattern as bill_posted_html, minus the Zoho-specific
    fields/CTA — DirectPay's "Post to ERP" step is entirely mocked, so
    there's no reference number or external link to show."""
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#0a0e1a;padding:28px 36px;">
          <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Neoflo</span>
          <span style="color:rgba(255,255,255,0.4);font-size:13px;margin-left:10px;">DirectPay</span>
        </td></tr>
        <tr><td style="padding:36px;">
          <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Invoice Posted Successfully</h2>
          <p style="margin:0 0 24px;color:#64748b;font-size:14px;">
            Your invoice has been reviewed against its contract and posted to our ERP system.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr style="background:#f1f5f9;">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;width:45%;">Field</td>
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Value</td>
            </tr>
            <tr><td style="padding:12px 16px;font-size:14px;color:#475569;border-top:1px solid #e2e8f0;">Bill Number</td>
                <td style="padding:12px 16px;font-size:14px;color:#0f172a;font-weight:600;border-top:1px solid #e2e8f0;">{invoice_number}</td></tr>
            <tr><td style="padding:12px 16px;font-size:14px;color:#475569;border-top:1px solid #e2e8f0;">Vendor</td>
                <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-top:1px solid #e2e8f0;">{vendor_name}</td></tr>
            <tr><td style="padding:12px 16px;font-size:14px;color:#475569;border-top:1px solid #e2e8f0;">Amount</td>
                <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-top:1px solid #e2e8f0;">{currency} {total_amount}</td></tr>
            <tr><td style="padding:12px 16px;font-size:14px;color:#475569;border-top:1px solid #e2e8f0;">Posted Date</td>
                <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-top:1px solid #e2e8f0;">{posted_date}</td></tr>
          </table>
          <p style="margin:32px 0 0;font-size:12px;color:#94a3b8;">
            This is an automated notification from Neoflo's DirectPay pipeline.
            Please do not reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def stp_failure_html(
    invoice_number: str,
    vendor_name: str,
    failed_stage: str,
    missing_fields: list[str],
) -> str:
    items_html = "".join(
        f'<li style="padding:4px 0;color:#0f172a;">{f}</li>' for f in missing_fields
    )
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#0a0e1a;padding:28px 36px;">
          <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Neoflo</span>
          <span style="color:rgba(255,255,255,0.4);font-size:13px;margin-left:10px;">Invoice Processing</span>
        </td></tr>
        <tr><td style="padding:36px;">
          <div style="display:inline-flex;align-items:center;gap:8px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 14px;margin-bottom:20px;">
            <span style="color:#dc2626;font-size:13px;font-weight:600;">Action Required</span>
          </div>
          <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Automatic Processing Stopped</h2>
          <p style="margin:0 0 20px;color:#64748b;font-size:14px;">
            Invoice <strong style="color:#0f172a;">{invoice_number}</strong> from <strong style="color:#0f172a;">{vendor_name}</strong>
            could not be automatically approved at the <strong style="color:#0f172a;">{failed_stage}</strong> stage.
            The following mandatory fields require attention:
          </p>
          <div style="background:#fef9f0;border:1px solid #fed7aa;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;">Missing or Mismatched Fields</p>
            <ul style="margin:0;padding-left:20px;font-size:14px;">
              {items_html}
            </ul>
          </div>
          <p style="margin:0;font-size:14px;color:#475569;">
            Please contact the finance team or resubmit your invoice with the required information corrected.
            The invoice will continue through manual review.
          </p>
          <p style="margin:32px 0 0;font-size:12px;color:#94a3b8;">
            This is an automated notification from Neoflo's invoice processing pipeline.
            Please do not reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


# ── DirectPay notifications to the payload address ────────────────────────────
# Both go to the `email` supplied on /dp-api/ingestion/trigger-upload — the
# CUSTOMER's own AP user, who asked to be notified about invoices they
# submitted. They are not vendor correspondence, so they report status and ask
# the reader to act inside the app; they never ask an outside party for anything.


def _dp_shell(heading: str, lede: str, inner_html: str) -> str:
    """The chrome the three DirectPay/P2P mails already share — dark Neoflo bar,
    600px white card, muted automated-notice footer."""
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#0a0e1a;padding:28px 36px;">
          <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Neoflo</span>
          <span style="color:rgba(255,255,255,0.4);font-size:13px;margin-left:10px;">DirectPay</span>
        </td></tr>
        <tr><td style="padding:36px;">
          <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;">{heading}</h2>
          <p style="margin:0 0 24px;color:#64748b;font-size:14px;">{lede}</p>
          {inner_html}
          <p style="margin:32px 0 0;font-size:12px;color:#94a3b8;">
            This is an automated notification from Neoflo's DirectPay pipeline.
            Please do not reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _dp_rows(rows: list[tuple[str, str]]) -> str:
    """Field/Value table, same styling as directpay_posted_html's."""
    body = "".join(
        f'<tr><td style="padding:12px 16px;font-size:14px;color:#475569;border-top:1px solid #e2e8f0;">{label}</td>'
        f'<td style="padding:12px 16px;font-size:14px;color:#0f172a;border-top:1px solid #e2e8f0;">{value}</td></tr>'
        for label, value in rows
    )
    return f"""<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr style="background:#f1f5f9;">
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;width:45%;">Field</td>
              <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Value</td>
            </tr>{body}
          </table>"""


def directpay_payment_scheduled_html(
    invoice_number: str,
    vendor_name: str,
    currency: str,
    payable_amount: str,
    posted_date: str,
    scheduled_payment_date: str | None,
) -> str:
    """Complete & valid: the invoice cleared every check and was posted.

    `scheduled_payment_date` is the invoice's own printed due date. When the
    document doesn't state one it is None and the row is OMITTED rather than
    guessed — inventing a payment date the invoice never gave would be worse
    than saying nothing.
    """
    rows = [
        ("Bill Number", invoice_number),
        ("Vendor", vendor_name),
        ("Payable Amount", f"{currency} {payable_amount}".strip()),
        ("Posted Date", posted_date),
    ]
    if scheduled_payment_date:
        rows.append(("Scheduled Payment Date", f'<strong>{scheduled_payment_date}</strong>'))
    note = (
        "" if scheduled_payment_date else
        '<p style="margin:20px 0 0;font-size:13px;color:#b45309;background:#fffbeb;'
        'border:1px solid #fde68a;border-radius:8px;padding:12px 14px;">'
        "This invoice does not state a payment due date, so no payment date has been "
        "scheduled. Set one in DirectPay before the payment run.</p>"
    )
    return _dp_shell(
        "Invoice Posted — Payment Scheduled" if scheduled_payment_date else "Invoice Posted",
        "This invoice was validated against its contract and posted to the ERP.",
        _dp_rows(rows) + note,
    )


def directpay_action_required_html(
    invoice_number: str,
    vendor_name: str,
    stage_label: str,
    reason_label: str,
    discrepancies: list[dict],
) -> str:
    """Incomplete / mismatched: automated processing stopped and needs a person.

    `discrepancies` is one dict per thing needing acknowledgement, with keys
    `label`, `expected`, `found` and optionally `note`. Only items that require a
    human acknowledgement belong here — anything the learned-ack memory already
    auto-approved is filtered out by the caller, since nobody needs telling
    about a check the system cleared itself.
    """
    if discrepancies:
        items = "".join(
            f'<tr><td style="padding:12px 16px;border-top:1px solid #e2e8f0;">'
            f'<div style="font-size:14px;color:#0f172a;font-weight:600;">{d.get("label","")}</div>'
            f'<div style="font-size:13px;color:#475569;margin-top:4px;">'
            f'Invoice: <strong>{d.get("found") or "—"}</strong><br>'
            f'Contract: <strong>{d.get("expected") or "—"}</strong></div>'
            + (f'<div style="font-size:12.5px;color:#b45309;margin-top:6px;">{d["note"]}</div>' if d.get("note") else "")
            + "</td></tr>"
            for d in discrepancies
        )
        detail = f"""<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr style="background:#f1f5f9;"><td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Needs your review ({len(discrepancies)})</td></tr>{items}
          </table>"""
    else:
        detail = ""

    return _dp_shell(
        "Action Required",
        f"Automated processing stopped at <strong>{stage_label}</strong> for "
        f"invoice <strong>{invoice_number}</strong> ({vendor_name}). {reason_label}",
        _dp_rows([("Invoice Number", invoice_number), ("Vendor", vendor_name), ("Stopped At", stage_label)]) + (
            f'<div style="margin-top:20px;">{detail}</div>' if detail else ""
        ),
    )


def directpay_escalation_html(
    invoice_number: str,
    vendor_name: str,
    invoice_amount: str,
    reference_amount: str,
    reference_label: str,
    tolerance: str,
    reason: str,
    notes: list[str],
    reviewer_note: str | None,
) -> str:
    """The Matching-stage Escalate action: a reviewer asking for a decision on a
    variance they can't clear themselves.

    Composed SERVER-side from the run, not from whatever the browser posted —
    this sends real mail as sales@neoflo.ai, so the body must not be
    caller-supplied. The reviewer's own free-text note is the one part that is,
    and it's rendered as a quoted block rather than as body copy.
    """
    bullets = "".join(
        f'<li style="margin:0 0 6px;">{n}</li>' for n in notes
    )
    extra = (
        f'<div style="margin-top:16px;"><div style="font-size:12px;font-weight:600;color:#64748b;'
        f'text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Also noted</div>'
        f'<ul style="margin:0;padding-left:18px;font-size:13.5px;color:#475569;">{bullets}</ul></div>'
        if bullets else ""
    )
    note_block = (
        f'<div style="margin-top:20px;padding:12px 14px;background:#f8fafc;border-left:3px solid #cbd5e1;'
        f'border-radius:0 6px 6px 0;"><div style="font-size:12px;font-weight:600;color:#64748b;'
        f'text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Note from reviewer</div>'
        f'<div style="font-size:13.5px;color:#334155;white-space:pre-wrap;">{reviewer_note}</div></div>'
        if reviewer_note else ""
    )
    return _dp_shell(
        "Escalation: approval needed",
        "This invoice cannot be approved at the Matching stage and needs a decision.",
        _dp_rows([
            ("Invoice Number", invoice_number),
            ("Vendor", vendor_name),
            ("Invoice Amount", invoice_amount),
            (reference_label, reference_amount),
            ("Tolerance", tolerance),
        ])
        + f'<div style="margin-top:20px;padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;'
          f'border-radius:8px;font-size:13.5px;color:#92400e;"><strong>Why it is blocked:</strong><br>{reason}</div>'
        + extra + note_block,
    )

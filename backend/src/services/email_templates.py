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

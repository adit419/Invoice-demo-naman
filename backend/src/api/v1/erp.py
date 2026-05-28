from fastapi import APIRouter

from ...auth.deps import CurrentUser

router = APIRouter(tags=["erp"])

# Hardcoded GL account list matching erp-integration-service/src/models/domain.py AccountOption
GL_ACCOUNTS = [
    {"code": "5001", "name": "Cost of Goods – Apparel"},
    {"code": "5002", "name": "Cost of Goods – Footwear"},
    {"code": "5003", "name": "Cost of Goods – Equipment"},
    {"code": "5010", "name": "Cost of Goods – General"},
    {"code": "6010", "name": "Marketing & Events"},
    {"code": "6020", "name": "Advertising & Promotions"},
    {"code": "6030", "name": "Travel & Entertainment"},
    {"code": "6040", "name": "Office Supplies"},
    {"code": "6050", "name": "Professional Services"},
    {"code": "6060", "name": "Rent & Facilities"},
    {"code": "6070", "name": "Utilities"},
    {"code": "7010", "name": "Freight & Logistics"},
    {"code": "7020", "name": "Import Duties & Taxes"},
    {"code": "7030", "name": "Customs & Clearance"},
    {"code": "8010", "name": "Miscellaneous Expenses"},
]


@router.get("/erp/accounts")
async def get_gl_accounts(current_user: CurrentUser):
    return {"data": GL_ACCOUNTS, "error": None}

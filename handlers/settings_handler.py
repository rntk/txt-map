from fastapi import APIRouter
from lib.llm import get_active_provider_name

router = APIRouter()


@router.get("/settings")
def get_settings():
    return {"llm_provider": get_active_provider_name()}

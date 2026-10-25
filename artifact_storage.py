import os
from typing import Any

import boto3


def get_s3_bucket_config() -> tuple[str, str] | None:
    bucket_name = os.getenv("S3_BUCKET_NAME")
    if not bucket_name:
        return None

    region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
    if not region:
        raise RuntimeError("AWS_REGION must be set when S3_BUCKET_NAME is configured")

    return bucket_name, region


def s3_is_enabled() -> bool:
    return get_s3_bucket_config() is not None


def get_s3_client() -> Any:
    config = get_s3_bucket_config()
    if config is None:
        raise RuntimeError("S3 storage is not configured")

    _, region = config
    return boto3.client("s3", region_name=region)


def upload_artifact(path: str, key: str) -> None:
    config = get_s3_bucket_config()
    if config is None:
        raise RuntimeError("S3 storage is not configured")

    bucket_name, _ = config
    get_s3_client().upload_file(
        path,
        bucket_name,
        key,
        ExtraArgs={"ContentType": "application/octet-stream"},
    )


def get_artifact_object(key: str) -> dict[str, Any]:
    config = get_s3_bucket_config()
    if config is None:
        raise RuntimeError("S3 storage is not configured")

    bucket_name, _ = config
    return get_s3_client().get_object(Bucket=bucket_name, Key=key)

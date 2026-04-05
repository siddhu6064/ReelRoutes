"""
tests/integration/test_user_document.py

Integration tests for UserDocument against mongomock-motor.
Tests insert, read, unique index enforcement, and field integrity.
"""

from __future__ import annotations

import pytest

from app.models.documents import UserDocument
from app.utils.seed import SeedFactory


@pytest.mark.asyncio
class TestUserDocumentInsertAndRead:
    async def test_insert_returns_document_with_id(self) -> None:
        user = await SeedFactory.user()
        assert user.id is not None

    async def test_find_by_clerk_id(self) -> None:
        await SeedFactory.user(clerk_id="clerk_findme")
        found = await UserDocument.find_one(UserDocument.clerk_id == "clerk_findme")
        assert found is not None
        assert found.clerk_id == "clerk_findme"

    async def test_find_by_email(self) -> None:
        await SeedFactory.user(email="unique@test.com")
        found = await UserDocument.find_one(UserDocument.email == "unique@test.com")
        assert found is not None

    async def test_all_required_fields_persisted(self) -> None:
        user = await SeedFactory.user(
            clerk_id="clerk_abc",
            email="abc@test.com",
            name="Alice Bob",
        )
        reloaded = await UserDocument.get(user.id)
        assert reloaded is not None
        assert reloaded.clerk_id == "clerk_abc"
        assert reloaded.email == "abc@test.com"
        assert reloaded.name == "Alice Bob"

    async def test_optional_oauth_fields_null_by_default(self) -> None:
        user = await SeedFactory.user()
        reloaded = await UserDocument.get(user.id)
        assert reloaded is not None
        assert reloaded.google_id is None
        assert reloaded.apple_id is None
        assert reloaded.avatar_url is None

    async def test_optional_oauth_fields_persisted(self) -> None:
        user = await SeedFactory.user(google_id="g_123", apple_id="a_456")
        reloaded = await UserDocument.get(user.id)
        assert reloaded is not None
        assert reloaded.google_id == "g_123"
        assert reloaded.apple_id == "a_456"

    async def test_created_at_and_updated_at_set_on_insert(self) -> None:
        user = await SeedFactory.user()
        assert user.created_at is not None
        assert user.updated_at is not None
        assert user.created_at.tzinfo is not None  # must be timezone-aware

    async def test_find_all_returns_all_inserted_users(self) -> None:
        await SeedFactory.user()
        await SeedFactory.user()
        await SeedFactory.user()
        all_users = await UserDocument.find_all().to_list()
        assert len(all_users) == 3

    async def test_delete_removes_document(self) -> None:
        user = await SeedFactory.user()
        await user.delete()
        found = await UserDocument.get(user.id)
        assert found is None


@pytest.mark.asyncio
class TestUserDocumentUniqueIndex:
    async def test_duplicate_clerk_id_raises(self) -> None:
        await SeedFactory.user(clerk_id="clerk_dup")
        with pytest.raises(Exception):  # noqa: B017 — mongomock raises generic DuplicateKeyError
            await SeedFactory.user(clerk_id="clerk_dup")

    async def test_different_clerk_ids_allowed(self) -> None:
        u1 = await SeedFactory.user(clerk_id="clerk_001")
        u2 = await SeedFactory.user(clerk_id="clerk_002")
        assert u1.id != u2.id


@pytest.mark.asyncio
class TestUserDocumentUpdate:
    async def test_update_name(self) -> None:
        user = await SeedFactory.user(name="Old Name")
        user.name = "New Name"
        await user.save()
        reloaded = await UserDocument.get(user.id)
        assert reloaded is not None
        assert reloaded.name == "New Name"

    async def test_update_email(self) -> None:
        user = await SeedFactory.user(email="old@test.com")
        user.email = "new@test.com"
        await user.save()
        reloaded = await UserDocument.get(user.id)
        assert reloaded is not None
        assert reloaded.email == "new@test.com"

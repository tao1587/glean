"""Integration tests for feeds and subscriptions API endpoints."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select


class TestListSubscriptions:
    """Test listing user subscriptions."""

    @pytest.mark.asyncio
    async def test_list_empty_subscriptions(self, client: AsyncClient, auth_headers):
        """Test listing subscriptions when user has none."""
        response = await client.get("/api/feeds", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "items" in data
        assert isinstance(data["items"], list)
        assert len(data["items"]) == 0
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_list_subscriptions(
        self, client: AsyncClient, auth_headers, test_subscription, test_feed
    ):
        """Test listing user subscriptions."""
        response = await client.get("/api/feeds", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert "items" in data
        assert isinstance(data["items"], list)
        assert len(data["items"]) == 1
        assert data["total"] == 1

        subscription = data["items"][0]
        assert subscription["id"] == str(test_subscription.id)
        assert "feed" in subscription
        assert subscription["feed"]["url"] == test_feed.url

    @pytest.mark.asyncio
    async def test_list_subscriptions_unauthorized(self, client: AsyncClient):
        """Test listing subscriptions without authentication."""
        response = await client.get("/api/feeds")

        assert response.status_code == 401


class TestGetSubscription:
    """Test getting a specific subscription."""

    @pytest.mark.asyncio
    async def test_get_subscription_success(
        self, client: AsyncClient, auth_headers, test_subscription, test_feed
    ):
        """Test getting a specific subscription."""
        response = await client.get(f"/api/feeds/{test_subscription.id}", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()

        assert data["id"] == str(test_subscription.id)
        assert "feed" in data
        assert data["feed"]["url"] == test_feed.url

    @pytest.mark.asyncio
    async def test_get_nonexistent_subscription(self, client: AsyncClient, auth_headers):
        """Test getting a non-existent subscription."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = await client.get(f"/api/feeds/{fake_id}", headers=auth_headers)

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_subscription_unauthorized(self, client: AsyncClient, test_subscription):
        """Test getting subscription without authentication."""
        response = await client.get(f"/api/feeds/{test_subscription.id}")

        assert response.status_code == 401


class TestCreateSubscription:
    """Test creating subscriptions (discovering feeds)."""

    @pytest.mark.asyncio
    async def test_discover_feed_new_feed(self, client: AsyncClient, auth_headers):
        """Test discovering and subscribing to a new feed."""
        response = await client.post(
            "/api/feeds/discover",
            headers=auth_headers,
            json={"url": "https://newblog.com/feed.xml"},
        )

        assert response.status_code == 201
        data = response.json()

        assert "id" in data
        assert "feed" in data
        assert data["feed"]["url"] == "https://newblog.com/feed.xml"

    @pytest.mark.asyncio
    async def test_discover_feed_existing_feed(self, client: AsyncClient, auth_headers, test_feed):
        """Test subscribing to an existing feed."""
        response = await client.post(
            "/api/feeds/discover", headers=auth_headers, json={"url": test_feed.url}
        )

        assert response.status_code == 201
        data = response.json()

        assert "id" in data
        assert data["feed"]["url"] == test_feed.url

    @pytest.mark.asyncio
    async def test_discover_feed_with_rsshub_path_only(
        self, client: AsyncClient, auth_headers, monkeypatch: pytest.MonkeyPatch
    ):
        """Test subscribing with only an RSSHub path."""
        from glean_core.services.feed_service import FeedService

        async def mock_build_rsshub_feed_url(self, rsshub_path: str) -> str:
            assert rsshub_path == "/bilibili/user/dynamic/946974"
            return "http://rsshub.internal/bilibili/user/dynamic/946974"

        monkeypatch.setattr(FeedService, "_build_rsshub_feed_url", mock_build_rsshub_feed_url)

        response = await client.post(
            "/api/feeds/discover",
            headers=auth_headers,
            json={"rsshub_path": "/bilibili/user/dynamic/946974"},
        )

        assert response.status_code == 201
        data = response.json()

        assert "id" in data
        assert data["feed"]["url"] == "http://rsshub.internal/bilibili/user/dynamic/946974"

    @pytest.mark.asyncio
    async def test_discover_feed_duplicate_subscription(
        self, client: AsyncClient, auth_headers, test_subscription, test_feed
    ):
        """Test subscribing to an already subscribed feed."""
        response = await client.post(
            "/api/feeds/discover", headers=auth_headers, json={"url": test_feed.url}
        )

        assert response.status_code == 400
        assert "already subscribed" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_discover_feed_unauthorized(self, client: AsyncClient):
        """Test discovering feed without authentication."""
        response = await client.post(
            "/api/feeds/discover", json={"url": "https://example.com/feed.xml"}
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_discover_feed_requires_url_or_rsshub_path(
        self, client: AsyncClient, auth_headers
    ):
        """Test creating a subscription without any source input."""
        response = await client.post("/api/feeds/discover", headers=auth_headers, json={})

        assert response.status_code == 422


class TestUpdateSubscription:
    """Test updating subscription settings."""

    @pytest.mark.asyncio
    async def test_update_subscription_custom_title(
        self, client: AsyncClient, auth_headers, test_subscription
    ):
        """Test updating subscription with custom title."""
        response = await client.patch(
            f"/api/feeds/{test_subscription.id}",
            headers=auth_headers,
            json={"custom_title": "My Custom Feed Title"},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["custom_title"] == "My Custom Feed Title"

    @pytest.mark.asyncio
    async def test_update_subscription_clear_custom_title(
        self, client: AsyncClient, auth_headers, test_subscription
    ):
        """Test clearing custom title."""
        # First set a custom title
        await client.patch(
            f"/api/feeds/{test_subscription.id}",
            headers=auth_headers,
            json={"custom_title": "Custom Title"},
        )

        # Then clear it
        response = await client.patch(
            f"/api/feeds/{test_subscription.id}", headers=auth_headers, json={"custom_title": None}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["custom_title"] is None

    @pytest.mark.asyncio
    async def test_update_nonexistent_subscription(self, client: AsyncClient, auth_headers):
        """Test updating a non-existent subscription."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = await client.patch(
            f"/api/feeds/{fake_id}", headers=auth_headers, json={"custom_title": "Title"}
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_subscription_unauthorized(self, client: AsyncClient, test_subscription):
        """Test updating subscription without authentication."""
        response = await client.patch(
            f"/api/feeds/{test_subscription.id}", json={"custom_title": "Title"}
        )

        assert response.status_code == 401


class TestDeleteSubscription:
    """Test deleting subscriptions."""

    @pytest.mark.asyncio
    async def test_delete_subscription_success(
        self, client: AsyncClient, auth_headers, test_subscription
    ):
        """Test successfully deleting a subscription."""
        response = await client.delete(f"/api/feeds/{test_subscription.id}", headers=auth_headers)

        assert response.status_code == 204

        # Verify it's actually deleted
        get_response = await client.get(f"/api/feeds/{test_subscription.id}", headers=auth_headers)
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_subscription_with_entry_translations(
        self, client: AsyncClient, auth_headers, db_session, test_subscription, test_feed
    ):
        """Test deleting subscription when feed entries have translations."""
        from sqlalchemy import func, select

        from glean_database.models.entry import Entry
        from glean_database.models.entry_translation import EntryTranslation

        entry = Entry(
            feed_id=test_feed.id,
            url="https://example.com/article-1",
            title="Article 1",
            content="Content",
            guid="article-1",
        )
        db_session.add(entry)
        await db_session.flush()

        translation = EntryTranslation(
            entry_id=entry.id,
            target_language="zh-CN",
            translated_title="文章 1",
            translated_content="内容",
            status="done",
        )
        db_session.add(translation)
        await db_session.commit()

        response = await client.delete(f"/api/feeds/{test_subscription.id}", headers=auth_headers)
        assert response.status_code == 204

        remaining_stmt = select(func.count(EntryTranslation.id)).where(
            EntryTranslation.target_language == "zh-CN"
        )
        remaining = await db_session.scalar(remaining_stmt)
        assert remaining == 0

    @pytest.mark.asyncio
    async def test_delete_subscription_preserves_entry_bookmarks_as_url_bookmarks(
        self, client: AsyncClient, auth_headers, db_session, test_subscription, test_feed, test_user
    ):
        """Deleting the last subscription should preserve legacy entry-only bookmarks."""
        from glean_database.models.bookmark import Bookmark
        from glean_database.models.entry import Entry

        entry = Entry(
            feed_id=test_feed.id,
            url="https://example.com/articles/delete-me",
            title="Delete Me",
            author="Test Author",
            summary="Test summary",
        )
        db_session.add(entry)
        await db_session.flush()

        bookmark = Bookmark(
            user_id=test_user.id,
            entry_id=entry.id,
            url=None,
            title=entry.title,
            excerpt=entry.summary,
            snapshot_status="pending",
        )
        db_session.add(bookmark)
        await db_session.commit()

        response = await client.delete(f"/api/feeds/{test_subscription.id}", headers=auth_headers)

        assert response.status_code == 204

        refreshed_bookmark = await db_session.get(Bookmark, bookmark.id)
        assert refreshed_bookmark is not None
        assert refreshed_bookmark.entry_id is None
        assert refreshed_bookmark.url == entry.url

        deleted_entry = await db_session.execute(select(Entry).where(Entry.id == entry.id))
        assert deleted_entry.scalar_one_or_none() is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_subscription(self, client: AsyncClient, auth_headers):
        """Test deleting a non-existent subscription."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = await client.delete(f"/api/feeds/{fake_id}", headers=auth_headers)

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_subscription_unauthorized(self, client: AsyncClient, test_subscription):
        """Test deleting subscription without authentication."""
        response = await client.delete(f"/api/feeds/{test_subscription.id}")

        assert response.status_code == 401


class TestImportOPML:
    """Test OPML import behavior."""

    @pytest.mark.asyncio
    async def test_reimport_updates_existing_subscription_folder(
        self, client: AsyncClient, auth_headers
    ):
        """Duplicate import should move existing subscription to latest OPML folder."""
        feed_url = f"https://example.com/reimport-{uuid.uuid4().hex}.xml"

        old_folder_resp = await client.post(
            "/api/folders",
            json={"name": "Old Folder", "type": "feed"},
            headers=auth_headers,
        )
        assert old_folder_resp.status_code == 201
        old_folder_id = old_folder_resp.json()["id"]

        subscribe_resp = await client.post(
            "/api/feeds/discover",
            json={"url": feed_url, "folder_id": old_folder_id},
            headers=auth_headers,
        )
        assert subscribe_resp.status_code == 201

        opml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Import</title></head>
  <body>
    <outline text="New Folder">
      <outline text="Reimport Feed" title="Reimport Feed" xmlUrl="{feed_url}" type="rss"/>
    </outline>
  </body>
</opml>
"""
        import_resp = await client.post(
            "/api/feeds/import",
            files={"file": ("subscriptions.opml", opml_content, "text/xml")},
            headers=auth_headers,
        )
        assert import_resp.status_code == 200
        assert import_resp.json()["failed"] == 0
        assert import_resp.json()["success"] == 1

        folders_resp = await client.get("/api/folders?type=feed", headers=auth_headers)
        assert folders_resp.status_code == 200
        new_folder_id = next(
            folder["id"]
            for folder in folders_resp.json()["folders"]
            if folder["name"] == "New Folder"
        )

        subscriptions_resp = await client.get("/api/feeds", headers=auth_headers)
        assert subscriptions_resp.status_code == 200
        subscription = subscriptions_resp.json()["items"][0]
        assert subscription["feed"]["url"] == feed_url
        assert subscription["folder_id"] == new_folder_id

    @pytest.mark.asyncio
    async def test_reimport_updates_existing_subscription_to_ungrouped(
        self, client: AsyncClient, auth_headers
    ):
        """Duplicate import with root feed should clear existing folder assignment."""
        feed_url = f"https://example.com/reimport-root-{uuid.uuid4().hex}.xml"

        folder_resp = await client.post(
            "/api/folders",
            json={"name": "Folder Before", "type": "feed"},
            headers=auth_headers,
        )
        assert folder_resp.status_code == 201
        folder_id = folder_resp.json()["id"]

        subscribe_resp = await client.post(
            "/api/feeds/discover",
            json={"url": feed_url, "folder_id": folder_id},
            headers=auth_headers,
        )
        assert subscribe_resp.status_code == 201

        opml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Import</title></head>
  <body>
    <outline text="Root Feed" title="Root Feed" xmlUrl="{feed_url}" type="rss"/>
  </body>
</opml>
"""
        import_resp = await client.post(
            "/api/feeds/import",
            files={"file": ("subscriptions.opml", opml_content, "text/xml")},
            headers=auth_headers,
        )
        assert import_resp.status_code == 200
        assert import_resp.json()["failed"] == 0
        assert import_resp.json()["success"] == 1

        subscriptions_resp = await client.get("/api/feeds", headers=auth_headers)
        assert subscriptions_resp.status_code == 200
        subscription = subscriptions_resp.json()["items"][0]
        assert subscription["feed"]["url"] == feed_url
        assert subscription["folder_id"] is None

    @pytest.mark.asyncio
    async def test_reimport_reuses_existing_folder_and_reorganizes(
        self, client: AsyncClient, auth_headers
    ):
        """Re-import should reuse existing folder and move subscription to it."""
        feed_url = f"https://example.com/reimport-existing-{uuid.uuid4().hex}.xml"

        source_folder_resp = await client.post(
            "/api/folders",
            json={"name": "Source Folder", "type": "feed"},
            headers=auth_headers,
        )
        assert source_folder_resp.status_code == 201
        source_folder_id = source_folder_resp.json()["id"]

        target_folder_resp = await client.post(
            "/api/folders",
            json={"name": "Existing Target", "type": "feed"},
            headers=auth_headers,
        )
        assert target_folder_resp.status_code == 201
        target_folder_id = target_folder_resp.json()["id"]

        subscribe_resp = await client.post(
            "/api/feeds/discover",
            json={"url": feed_url, "folder_id": source_folder_id},
            headers=auth_headers,
        )
        assert subscribe_resp.status_code == 201

        opml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Import</title></head>
  <body>
    <outline text="Existing Target">
      <outline text="Feed" title="Feed" xmlUrl="{feed_url}" type="rss"/>
    </outline>
  </body>
</opml>
"""
        import_resp = await client.post(
            "/api/feeds/import",
            files={"file": ("subscriptions.opml", opml_content, "text/xml")},
            headers=auth_headers,
        )
        assert import_resp.status_code == 200
        data = import_resp.json()
        assert data["success"] == 1
        assert data["failed"] == 0
        assert data["folders_created"] == 0

        subscriptions_resp = await client.get("/api/feeds", headers=auth_headers)
        assert subscriptions_resp.status_code == 200
        subscription = subscriptions_resp.json()["items"][0]
        assert subscription["feed"]["url"] == feed_url
        assert subscription["folder_id"] == target_folder_id

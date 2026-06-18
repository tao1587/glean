"""
Integration tests for M2 API endpoints.

Tests for folders and bookmarks APIs.
"""

import pytest
from httpx import AsyncClient


class TestFolderAPI:
    """Test folder API endpoints."""

    @pytest.mark.asyncio
    async def test_create_folder(self, client: AsyncClient, auth_headers: dict):
        """Test creating a folder."""
        response = await client.post(
            "/api/folders",
            json={"name": "Test Folder", "type": "bookmark"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Folder"
        assert data["type"] == "bookmark"
        assert data["parent_id"] is None

    @pytest.mark.asyncio
    async def test_create_subfolder(self, client: AsyncClient, auth_headers: dict):
        """Test creating a subfolder."""
        parent_response = await client.post(
            "/api/folders",
            json={"name": "Parent Folder", "type": "feed"},
            headers=auth_headers,
        )
        assert parent_response.status_code == 201
        parent_id = parent_response.json()["id"]

        response = await client.post(
            "/api/folders",
            json={"name": "Child Folder", "type": "feed", "parent_id": parent_id},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["parent_id"] == parent_id

    @pytest.mark.asyncio
    async def test_get_folders_tree(self, client: AsyncClient, auth_headers: dict):
        """Test getting folders as a tree."""
        await client.post(
            "/api/folders",
            json={"name": "Folder A", "type": "bookmark"},
            headers=auth_headers,
        )
        await client.post(
            "/api/folders",
            json={"name": "Folder B", "type": "bookmark"},
            headers=auth_headers,
        )

        response = await client.get("/api/folders?type=bookmark", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "folders" in data
        assert len(data["folders"]) >= 2

    @pytest.mark.asyncio
    async def test_update_folder(self, client: AsyncClient, auth_headers: dict):
        """Test updating a folder."""
        create_response = await client.post(
            "/api/folders",
            json={"name": "Original Name", "type": "bookmark"},
            headers=auth_headers,
        )
        folder_id = create_response.json()["id"]

        response = await client.patch(
            f"/api/folders/{folder_id}",
            json={"name": "Updated Name"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"

    @pytest.mark.asyncio
    async def test_delete_folder(self, client: AsyncClient, auth_headers: dict):
        """Test deleting a folder."""
        create_response = await client.post(
            "/api/folders",
            json={"name": "To Delete", "type": "bookmark"},
            headers=auth_headers,
        )
        folder_id = create_response.json()["id"]

        response = await client.delete(f"/api/folders/{folder_id}", headers=auth_headers)
        assert response.status_code == 204

        get_response = await client.get(f"/api/folders/{folder_id}", headers=auth_headers)
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_folder_type_mismatch(self, client: AsyncClient, auth_headers: dict):
        """Test that parent and child folders must have the same type."""
        parent_response = await client.post(
            "/api/folders",
            json={"name": "Feed Folder", "type": "feed"},
            headers=auth_headers,
        )
        parent_id = parent_response.json()["id"]

        response = await client.post(
            "/api/folders",
            json={"name": "Bookmark Child", "type": "bookmark", "parent_id": parent_id},
            headers=auth_headers,
        )
        assert response.status_code == 400


class TestBookmarkAPI:
    """Test bookmark API endpoints."""

    @pytest.mark.asyncio
    async def test_create_bookmark_external_url(self, client: AsyncClient, auth_headers: dict):
        """Test creating a bookmark for an external URL."""
        response = await client.post(
            "/api/bookmarks",
            json={
                "url": "https://example.com/article",
                "title": "Test Article",
                "excerpt": "Test excerpt",
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["url"] == "https://example.com/article"
        assert data["title"] == "Test Article"
        assert data["entry_id"] is None

    @pytest.mark.asyncio
    async def test_create_bookmark_with_folder(self, client: AsyncClient, auth_headers: dict):
        """Test creating a bookmark with folder associations."""
        folder_response = await client.post(
            "/api/folders",
            json={"name": "Bookmarks Folder", "type": "bookmark"},
            headers=auth_headers,
        )
        folder_id = folder_response.json()["id"]

        response = await client.post(
            "/api/bookmarks",
            json={
                "url": "https://example.com/important",
                "title": "Important Article",
                "folder_ids": [folder_id],
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert len(data["folders"]) == 1
        assert data["folders"][0]["id"] == folder_id

    @pytest.mark.asyncio
    async def test_get_bookmarks_with_filters(self, client: AsyncClient, auth_headers: dict):
        """Test getting bookmarks with filtering."""
        folder_response = await client.post(
            "/api/folders",
            json={"name": "Filter Test Folder", "type": "bookmark"},
            headers=auth_headers,
        )
        folder_id = folder_response.json()["id"]

        await client.post(
            "/api/bookmarks",
            json={
                "url": "https://example.com/filtered",
                "title": "Filtered Article",
                "folder_ids": [folder_id],
            },
            headers=auth_headers,
        )

        response = await client.get(f"/api/bookmarks?folder_id={folder_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_update_bookmark(self, client: AsyncClient, auth_headers: dict):
        """Test updating a bookmark."""
        create_response = await client.post(
            "/api/bookmarks",
            json={"url": "https://example.com/update", "title": "Original Title"},
            headers=auth_headers,
        )
        bookmark_id = create_response.json()["id"]

        response = await client.patch(
            f"/api/bookmarks/{bookmark_id}",
            json={"title": "Updated Title", "excerpt": "New excerpt"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Updated Title"
        assert data["excerpt"] == "New excerpt"

    @pytest.mark.asyncio
    async def test_delete_bookmark(self, client: AsyncClient, auth_headers: dict):
        """Test deleting a bookmark."""
        create_response = await client.post(
            "/api/bookmarks",
            json={"url": "https://example.com/delete", "title": "To Delete"},
            headers=auth_headers,
        )
        bookmark_id = create_response.json()["id"]

        response = await client.delete(f"/api/bookmarks/{bookmark_id}", headers=auth_headers)
        assert response.status_code == 204

        get_response = await client.get(f"/api/bookmarks/{bookmark_id}", headers=auth_headers)
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_add_remove_bookmark_folder(self, client: AsyncClient, auth_headers: dict):
        """Test adding and removing folder from bookmark."""
        folder_response = await client.post(
            "/api/folders",
            json={"name": "Add/Remove Folder", "type": "bookmark"},
            headers=auth_headers,
        )
        folder_id = folder_response.json()["id"]

        create_response = await client.post(
            "/api/bookmarks",
            json={"url": "https://example.com/addremove", "title": "Test"},
            headers=auth_headers,
        )
        bookmark_id = create_response.json()["id"]

        add_response = await client.post(
            f"/api/bookmarks/{bookmark_id}/folders",
            json={"folder_id": folder_id},
            headers=auth_headers,
        )
        assert add_response.status_code == 200
        assert len(add_response.json()["folders"]) == 1

        remove_response = await client.delete(
            f"/api/bookmarks/{bookmark_id}/folders/{folder_id}", headers=auth_headers
        )
        assert remove_response.status_code == 200
        assert len(remove_response.json()["folders"]) == 0

    @pytest.mark.asyncio
    async def test_bookmark_validation(self, client: AsyncClient, auth_headers: dict):
        """Test bookmark validation - either entry_id or url required."""
        response = await client.post(
            "/api/bookmarks",
            json={"title": "No Source"},
            headers=auth_headers,
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_bookmark_url_only_triggers_metadata_fetch(
        self, client: AsyncClient, auth_headers: dict, test_mock_redis
    ):
        """Test creating a bookmark with only URL triggers async metadata fetch."""
        test_mock_redis.enqueued_jobs.clear()

        response = await client.post(
            "/api/bookmarks",
            json={"url": "https://example.com/article-without-title"},
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()

        assert data["url"] == "https://example.com/article-without-title"
        assert data["title"] == "https://example.com/article-without-title"

        assert len(test_mock_redis.enqueued_jobs) == 1
        job_name, job_args = test_mock_redis.enqueued_jobs[0]
        assert job_name == "fetch_bookmark_metadata_task"
        assert job_args[0] == data["id"]

    @pytest.mark.asyncio
    async def test_create_bookmark_with_title_no_metadata_fetch(
        self, client: AsyncClient, auth_headers: dict, test_mock_redis
    ):
        """Test creating a bookmark with title and excerpt does not trigger metadata fetch."""
        test_mock_redis.enqueued_jobs.clear()

        response = await client.post(
            "/api/bookmarks",
            json={
                "url": "https://example.com/complete-bookmark",
                "title": "Complete Bookmark",
                "excerpt": "This is a complete bookmark with all info",
            },
            headers=auth_headers,
        )
        assert response.status_code == 201
        data = response.json()

        assert data["title"] == "Complete Bookmark"
        assert data["excerpt"] == "This is a complete bookmark with all info"
        assert len(test_mock_redis.enqueued_jobs) == 0

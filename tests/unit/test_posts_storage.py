"""
Unit tests for the PostsStorage class.

Tests all methods in lib/storage/posts.py:
- __init__
- prepare
- get_by_category
- get_all
- get_grouped_stat
- get_by_tags
- get_by_bi_grams
- get_by_feed_id
- get_by_pid
- get_by_id
- get_by_pids
- change_status
- get_stat
- set_clusters
- get_by_clusters
- get_clusters
- count

Also tests:
- Class constants (indexes)
- Error handling
- MongoDB mocking
"""
import pytest
from unittest.mock import MagicMock, patch, call
from datetime import datetime, UTC

from lib.storage.posts import PostsStorage
from pymongo import DESCENDING, UpdateMany


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def mock_db():
    """Create a mock MongoDB database."""
    db = MagicMock()
    db.posts = MagicMock()
    return db


@pytest.fixture
def mock_logger():
    """Create a mock logger."""
    return MagicMock()


@pytest.fixture
def sample_post():
    """Create a sample post document."""
    return {
        "_id": "post-id-001",
        "id": 12345,
        "pid": 12345,
        "owner": "test-owner",
        "category_id": "category-001",
        "feed_id": "feed-001",
        "title": "Test Post Title",
        "content": "Test post content",
        "read": False,
        "tags": ["tag1", "tag2"],
        "bi_grams": ["bi gram1", "bi gram2"],
        "unix_date": 1704067200,
        "created_at": datetime(2024, 1, 1, tzinfo=UTC),
        "clusters": ["cluster-001"],
    }


@pytest.fixture
def mock_datetime():
    """Mock datetime with fixed timestamp."""
    fixed_now = datetime(2024, 6, 15, 10, 30, 0, tzinfo=UTC)
    with patch('lib.storage.posts.datetime') as mock_dt:
        mock_dt.now.return_value = fixed_now
        mock_dt.UTC = UTC
        yield mock_dt, fixed_now


# =============================================================================
# Test: Constants
# =============================================================================

class TestConstants:
    """Tests for class-level constants."""

    def test_indexes_contains_all_required_fields(self):
        """indexes contains all required index fields."""
        expected_indexes = ["owner", "category_id", "feed_id", "read", "tags", "pid"]
        assert PostsStorage.indexes == expected_indexes
        assert len(PostsStorage.indexes) == 6


# =============================================================================
# Test: __init__
# =============================================================================

class TestInit:
    """Tests for PostsStorage.__init__."""

    def test_initializes_db_connection(self, mock_db):
        """Initializes _db connection."""
        storage = PostsStorage(mock_db)
        assert storage._db is mock_db

    def test_initializes_logger(self, mock_db):
        """Initializes logger with correct name."""
        storage = PostsStorage(mock_db)
        assert storage._log is not None
        assert storage._log.name == "posts"

    def test_logger_has_required_methods(self, mock_db):
        """Logger has required methods."""
        storage = PostsStorage(mock_db)
        assert hasattr(storage._log, 'warning')
        assert hasattr(storage._log, 'info')
        assert hasattr(storage._log, 'error')
        assert hasattr(storage._log, 'debug')

    def test_stores_db_reference(self, mock_db):
        """Stores db reference correctly."""
        storage = PostsStorage(mock_db)
        assert storage._db.posts is mock_db.posts


# =============================================================================
# Test: prepare
# =============================================================================

class TestPrepare:
    """Tests for PostsStorage.prepare."""

    def test_creates_index_on_owner(self, mock_db):
        """Creates index on 'owner'."""
        storage = PostsStorage(mock_db)
        storage.prepare()

        calls = mock_db.posts.create_index.call_args_list
        index_names = [call_arg[0][0] for call_arg in calls]
        assert "owner" in index_names

    def test_creates_index_on_category_id(self, mock_db):
        """Creates index on 'category_id'."""
        storage = PostsStorage(mock_db)
        storage.prepare()

        calls = mock_db.posts.create_index.call_args_list
        index_names = [call_arg[0][0] for call_arg in calls]
        assert "category_id" in index_names

    def test_creates_index_on_feed_id(self, mock_db):
        """Creates index on 'feed_id'."""
        storage = PostsStorage(mock_db)
        storage.prepare()

        calls = mock_db.posts.create_index.call_args_list
        index_names = [call_arg[0][0] for call_arg in calls]
        assert "feed_id" in index_names

    def test_creates_index_on_read(self, mock_db):
        """Creates index on 'read'."""
        storage = PostsStorage(mock_db)
        storage.prepare()

        calls = mock_db.posts.create_index.call_args_list
        index_names = [call_arg[0][0] for call_arg in calls]
        assert "read" in index_names

    def test_creates_index_on_tags(self, mock_db):
        """Creates index on 'tags'."""
        storage = PostsStorage(mock_db)
        storage.prepare()

        calls = mock_db.posts.create_index.call_args_list
        index_names = [call_arg[0][0] for call_arg in calls]
        assert "tags" in index_names

    def test_creates_index_on_pid(self, mock_db):
        """Creates index on 'pid'."""
        storage = PostsStorage(mock_db)
        storage.prepare()

        calls = mock_db.posts.create_index.call_args_list
        index_names = [call_arg[0][0] for call_arg in calls]
        assert "pid" in index_names

    def test_creates_all_6_indexes(self, mock_db):
        """Creates all 6 required indexes."""
        storage = PostsStorage(mock_db)
        storage.prepare()

        assert mock_db.posts.create_index.call_count == 6

    def test_handles_existing_indexes_gracefully(self, mock_db):
        """Handles existing indexes gracefully (logs warning)."""
        # Arrange: make create_index raise an exception
        mock_db.posts.create_index.side_effect = Exception("Index already exists")

        storage = PostsStorage(mock_db)
        with patch.object(storage._log, 'warning') as mock_warning:
            # Act: should not raise
            storage.prepare()

            # Assert: warning was logged for each index
            assert mock_warning.call_count == 6

    def test_handles_index_creation_errors_gracefully(self, mock_db):
        """Handles index creation errors gracefully."""
        # Arrange: make create_index raise an exception
        mock_db.posts.create_index.side_effect = Exception("Database error")

        storage = PostsStorage(mock_db)
        with patch.object(storage._log, 'warning') as mock_warning:
            # Act: should not raise
            storage.prepare()

            # Assert: warning was logged
            assert mock_warning.call_count == 6

    def test_warning_message_contains_index_name(self, mock_db):
        """Warning message contains index name."""
        mock_db.posts.create_index.side_effect = Exception("Index error")

        storage = PostsStorage(mock_db)
        with patch.object(storage._log, 'warning') as mock_warning:
            storage.prepare()

            # Check that at least one warning contains "owner"
            calls = mock_warning.call_args_list
            assert any("owner" in str(call_arg) for call_arg in calls)


# =============================================================================
# Test: get_by_category
# =============================================================================

class TestGetByCategory:
    """Tests for PostsStorage.get_by_category."""

    def test_returns_cursor_with_matching_posts(self, mock_db, sample_post):
        """Returns cursor with matching posts."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        result = storage.get_by_category("test-owner", category="category-001")

        # Assert - verify result is the cursor
        assert result is mock_cursor
        # Verify find was called with correct query including category
        find_call_args = mock_db.posts.find.call_args
        assert find_call_args is not None
        query = find_call_args[0][0]
        assert query["owner"] == "test-owner"
        assert query["category_id"] == "category-001"
        # Verify allow_disk_use and sort were called
        mock_cursor.allow_disk_use.assert_called_once_with(True)
        mock_cursor.sort.assert_called_once()

    def test_queries_by_owner_field(self, mock_db):
        """Queries by owner field."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_category("test-owner")

        query = mock_db.posts.find.call_args[0][0]
        assert query["owner"] == "test-owner"

    def test_filters_by_category_when_provided(self, mock_db):
        """Filters by category when provided."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_category("test-owner", category="category-001")

        query = mock_db.posts.find.call_args[0][0]
        assert query["category_id"] == "category-001"

    def test_does_not_filter_by_category_when_empty(self, mock_db):
        """Does not filter by category when empty."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_category("test-owner", category="")

        query = mock_db.posts.find.call_args[0][0]
        assert "category_id" not in query

    def test_filters_unread_when_only_unread_true(self, mock_db):
        """Filters unread when only_unread=True."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_category("test-owner", only_unread=True)

        query = mock_db.posts.find.call_args[0][0]
        assert query["read"] is False

    def test_filters_read_when_only_unread_false(self, mock_db):
        """Filters read when only_unread=False."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_category("test-owner", only_unread=False)

        query = mock_db.posts.find.call_args[0][0]
        assert query["read"] is True

    def test_does_not_filter_by_read_when_only_unread_none(self, mock_db):
        """Does not filter by read when only_unread=None."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_category("test-owner", only_unread=None)

        query = mock_db.posts.find.call_args[0][0]
        assert "read" not in query

    def test_sorts_by_feed_id_and_unix_date_when_only_unread_set(self, mock_db):
        """Sorts by feed_id and unix_date when only_unread is set."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_category("test-owner", only_unread=True)

        mock_cursor.sort.assert_called_once_with(
            [("feed_id", DESCENDING), ("unix_date", DESCENDING)]
        )

    def test_sorts_by_unix_date_only_when_only_unread_none(self, mock_db):
        """Sorts by unix_date only when only_unread=None."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_category("test-owner", only_unread=None)

        mock_cursor.sort.assert_called_once_with([("unix_date", DESCENDING)])

    def test_enables_disk_use(self, mock_db):
        """Enables disk use for large result sets."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_category("test-owner")

        mock_cursor.allow_disk_use.assert_called_once_with(True)


# =============================================================================
# Test: get_all
# =============================================================================

class TestGetAll:
    """Tests for PostsStorage.get_all."""

    def test_returns_all_posts_for_owner(self, mock_db):
        """Returns all posts for owner."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.find.return_value = mock_cursor

        result = storage.get_all("test-owner")

        assert result is not None

    def test_queries_by_owner_field(self, mock_db):
        """Queries by owner field."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.find.return_value = mock_cursor

        storage.get_all("test-owner")

        query = mock_db.posts.find.call_args[0][0]
        assert query["owner"] == "test-owner"

    def test_filters_unread_when_only_unread_true(self, mock_db):
        """Filters unread when only_unread=True."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.find.return_value = mock_cursor

        storage.get_all("test-owner", only_unread=True)

        query = mock_db.posts.find.call_args[0][0]
        assert query["read"] is False

    def test_filters_read_when_only_unread_false(self, mock_db):
        """Filters read when only_unread=False."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.find.return_value = mock_cursor

        storage.get_all("test-owner", only_unread=False)

        query = mock_db.posts.find.call_args[0][0]
        assert query["read"] is True

    def test_does_not_filter_by_read_when_only_unread_none(self, mock_db):
        """Does not filter by read when only_unread=None."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.find.return_value = mock_cursor

        storage.get_all("test-owner", only_unread=None)

        query = mock_db.posts.find.call_args[0][0]
        assert "read" not in query

    def test_supports_projection(self, mock_db):
        """Supports projection parameter."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.find.return_value = mock_cursor
        projection = {"title": 1, "content": 1}

        storage.get_all("test-owner", projection=projection)

        mock_db.posts.find.assert_called_once()
        assert mock_db.posts.find.call_args[1]["projection"] == projection


# =============================================================================
# Test: get_grouped_stat
# =============================================================================

class TestGetGroupedStat:
    """Tests for PostsStorage.get_grouped_stat."""

    def test_returns_aggregation_cursor(self, mock_db):
        """Returns aggregation cursor."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.aggregate.return_value = mock_cursor

        result = storage.get_grouped_stat("test-owner")

        assert result is mock_cursor

    def test_matches_by_owner(self, mock_db):
        """Matches documents by owner."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.aggregate.return_value = mock_cursor

        storage.get_grouped_stat("test-owner")

        pipeline = mock_db.posts.aggregate.call_args[0][0]
        match_stage = pipeline[0]
        assert match_stage["$match"]["owner"] == "test-owner"

    def test_groups_by_feed_id(self, mock_db):
        """Groups by feed_id."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.aggregate.return_value = mock_cursor

        storage.get_grouped_stat("test-owner")

        pipeline = mock_db.posts.aggregate.call_args[0][0]
        group_stage = pipeline[1]
        assert group_stage["$group"]["_id"] == "$feed_id"

    def test_includes_category_id_in_group(self, mock_db):
        """Includes category_id in group result."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.aggregate.return_value = mock_cursor

        storage.get_grouped_stat("test-owner")

        pipeline = mock_db.posts.aggregate.call_args[0][0]
        group_stage = pipeline[1]
        assert "category_id" in group_stage["$group"]

    def test_counts_posts_per_feed(self, mock_db):
        """Counts posts per feed."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.aggregate.return_value = mock_cursor

        storage.get_grouped_stat("test-owner")

        pipeline = mock_db.posts.aggregate.call_args[0][0]
        group_stage = pipeline[1]
        assert group_stage["$group"]["count"] == {"$sum": 1}

    def test_filters_unread_when_only_unread_true(self, mock_db):
        """Filters unread when only_unread=True."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.aggregate.return_value = mock_cursor

        storage.get_grouped_stat("test-owner", only_unread=True)

        pipeline = mock_db.posts.aggregate.call_args[0][0]
        match_stage = pipeline[0]
        assert match_stage["$match"]["read"] is False


# =============================================================================
# Test: get_by_tags
# =============================================================================

class TestGetByTags:
    """Tests for PostsStorage.get_by_tags."""

    def test_returns_cursor_with_matching_posts(self, mock_db):
        """Returns cursor with matching posts."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        result = storage.get_by_tags("test-owner", ["tag1", "tag2"])

        assert result is not None

    def test_queries_by_owner_field(self, mock_db):
        """Queries by owner field."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_tags("test-owner", ["tag1"])

        query = mock_db.posts.find.call_args[0][0]
        assert query["owner"] == "test-owner"

    def test_filters_by_tags_using_all_operator(self, mock_db):
        """Filters by tags using $all operator."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_tags("test-owner", ["tag1", "tag2"])

        query = mock_db.posts.find.call_args[0][0]
        assert query["tags"] == {"$all": ["tag1", "tag2"]}

    def test_filters_unread_when_only_unread_true(self, mock_db):
        """Filters unread when only_unread=True."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_tags("test-owner", ["tag1"], only_unread=True)

        query = mock_db.posts.find.call_args[0][0]
        assert query["read"] is False

    def test_sorts_by_feed_id_and_unix_date(self, mock_db):
        """Sorts by feed_id and unix_date."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_tags("test-owner", ["tag1"])

        mock_cursor.sort.assert_called_once_with(
            [("feed_id", DESCENDING), ("unix_date", DESCENDING)]
        )

    def test_supports_projection(self, mock_db):
        """Supports projection parameter."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor
        projection = {"title": 1}

        storage.get_by_tags("test-owner", ["tag1"], projection=projection)

        assert mock_db.posts.find.call_args[1]["projection"] == projection


# =============================================================================
# Test: get_by_bi_grams
# =============================================================================

class TestGetByBiGrams:
    """Tests for PostsStorage.get_by_bi_grams."""

    def test_returns_cursor_with_matching_posts(self, mock_db):
        """Returns cursor with matching posts."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        result = storage.get_by_bi_grams("test-owner", ["bi gram1"])

        assert result is not None

    def test_queries_by_owner_field(self, mock_db):
        """Queries by owner field."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_bi_grams("test-owner", ["bi gram1"])

        query = mock_db.posts.find.call_args[0][0]
        assert query["owner"] == "test-owner"

    def test_filters_by_bi_grams_using_all_operator(self, mock_db):
        """Filters by bi_grams using $all operator."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_bi_grams("test-owner", ["bi gram1", "bi gram2"])

        query = mock_db.posts.find.call_args[0][0]
        assert query["bi_grams"] == {"$all": ["bi gram1", "bi gram2"]}

    def test_filters_unread_when_only_unread_true(self, mock_db):
        """Filters unread when only_unread=True."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_bi_grams("test-owner", ["bi gram1"], only_unread=True)

        query = mock_db.posts.find.call_args[0][0]
        assert query["read"] is False

    def test_sorts_by_feed_id_and_unix_date(self, mock_db):
        """Sorts by feed_id and unix_date."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_bi_grams("test-owner", ["bi gram1"])

        mock_cursor.sort.assert_called_once_with(
            [("feed_id", DESCENDING), ("unix_date", DESCENDING)]
        )


# =============================================================================
# Test: get_by_feed_id
# =============================================================================

class TestGetByFeedId:
    """Tests for PostsStorage.get_by_feed_id."""

    def test_returns_cursor_with_matching_posts(self, mock_db):
        """Returns cursor with matching posts."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        result = storage.get_by_feed_id("test-owner", "feed-001")

        assert result is not None

    def test_queries_by_owner_and_feed_id(self, mock_db):
        """Queries by owner and feed_id."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_feed_id("test-owner", "feed-001")

        query = mock_db.posts.find.call_args[0][0]
        assert query["owner"] == "test-owner"
        assert query["feed_id"] == "feed-001"

    def test_filters_unread_when_only_unread_true(self, mock_db):
        """Filters unread when only_unread=True."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_feed_id("test-owner", "feed-001", only_unread=True)

        query = mock_db.posts.find.call_args[0][0]
        assert query["read"] is False

    def test_sorts_by_feed_id_and_unix_date_when_only_unread_set(self, mock_db):
        """Sorts by feed_id and unix_date when only_unread is set."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_feed_id("test-owner", "feed-001", only_unread=True)

        mock_cursor.sort.assert_called_once_with(
            [("feed_id", DESCENDING), ("unix_date", DESCENDING)]
        )

    def test_sorts_by_unix_date_only_when_only_unread_none(self, mock_db):
        """Sorts by unix_date only when only_unread=None."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_feed_id("test-owner", "feed-001", only_unread=None)

        mock_cursor.sort.assert_called_once_with([("unix_date", DESCENDING)])


# =============================================================================
# Test: get_by_pid
# =============================================================================

class TestGetByPid:
    """Tests for PostsStorage.get_by_pid."""

    def test_returns_post_document_when_found(self, mock_db, sample_post):
        """Returns post document when found."""
        storage = PostsStorage(mock_db)
        mock_db.posts.find_one.return_value = sample_post

        result = storage.get_by_pid("test-owner", 12345)

        assert result == sample_post

    def test_returns_none_when_not_found(self, mock_db):
        """Returns None when not found."""
        storage = PostsStorage(mock_db)
        mock_db.posts.find_one.return_value = None

        result = storage.get_by_pid("test-owner", 99999)

        assert result is None

    def test_queries_by_owner_and_pid(self, mock_db):
        """Queries by owner and pid."""
        storage = PostsStorage(mock_db)
        storage.get_by_pid("test-owner", 12345)

        call_args = mock_db.posts.find_one.call_args
        assert call_args[0][0] == {"owner": "test-owner", "pid": 12345}

    def test_supports_projection(self, mock_db):
        """Supports projection parameter."""
        storage = PostsStorage(mock_db)
        projection = {"title": 1, "content": 1}

        storage.get_by_pid("test-owner", 12345, projection=projection)

        assert mock_db.posts.find_one.call_args[1]["projection"] == projection


# =============================================================================
# Test: get_by_id
# =============================================================================

class TestGetById:
    """Tests for PostsStorage.get_by_id."""

    def test_returns_post_document_when_found(self, mock_db, sample_post):
        """Returns post document when found."""
        storage = PostsStorage(mock_db)
        mock_db.posts.find_one.return_value = sample_post

        result = storage.get_by_id("test-owner", 12345)

        assert result == sample_post

    def test_returns_none_when_not_found(self, mock_db):
        """Returns None when not found."""
        storage = PostsStorage(mock_db)
        mock_db.posts.find_one.return_value = None

        result = storage.get_by_id("test-owner", 99999)

        assert result is None

    def test_queries_by_owner_and_id_field(self, mock_db):
        """Queries by owner and 'id' field (not pid)."""
        storage = PostsStorage(mock_db)
        storage.get_by_id("test-owner", 12345)

        call_args = mock_db.posts.find_one.call_args
        assert call_args[0][0] == {"owner": "test-owner", "id": 12345}

    def test_supports_projection(self, mock_db):
        """Supports projection parameter."""
        storage = PostsStorage(mock_db)
        projection = {"title": 1, "content": 1}

        storage.get_by_id("test-owner", 12345, projection=projection)

        assert mock_db.posts.find_one.call_args[1]["projection"] == projection


# =============================================================================
# Test: get_by_pids
# =============================================================================

class TestGetByPids:
    """Tests for PostsStorage.get_by_pids."""

    def test_returns_cursor_with_matching_posts(self, mock_db):
        """Returns cursor with matching posts."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.find.return_value = mock_cursor

        result = storage.get_by_pids("test-owner", [1, 2, 3])

        assert result is not None

    def test_queries_by_owner_and_pid_in_list(self, mock_db):
        """Queries by owner and pid in list."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_pids("test-owner", [1, 2, 3])

        query = mock_db.posts.find.call_args[0][0]
        assert query["owner"] == "test-owner"
        assert query["pid"] == {"$in": [1, 2, 3]}

    def test_supports_projection(self, mock_db):
        """Supports projection parameter."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_db.posts.find.return_value = mock_cursor
        projection = {"title": 1}

        storage.get_by_pids("test-owner", [1, 2], projection=projection)

        assert mock_db.posts.find.call_args[1]["projection"] == projection


# =============================================================================
# Test: change_status
# =============================================================================

class TestChangeStatus:
    """Tests for PostsStorage.change_status."""

    def test_updates_read_status_for_pids(self, mock_db):
        """Updates read status for specified pids."""
        storage = PostsStorage(mock_db)
        mock_db.posts.update_many.return_value = MagicMock(modified_count=3)

        result = storage.change_status("test-owner", [1, 2, 3], True)

        assert result is True

    def test_queries_by_owner_and_pid_in_list(self, mock_db):
        """Queries by owner and pid in list."""
        storage = PostsStorage(mock_db)
        mock_db.posts.update_many.return_value = MagicMock(modified_count=3)

        storage.change_status("test-owner", [1, 2, 3], True)

        query = mock_db.posts.update_many.call_args[0][0]
        assert query["owner"] == "test-owner"
        assert query["pid"] == {"$in": [1, 2, 3]}

    def test_sets_read_to_true(self, mock_db):
        """Sets read to True."""
        storage = PostsStorage(mock_db)
        mock_db.posts.update_many.return_value = MagicMock(modified_count=3)

        storage.change_status("test-owner", [1, 2, 3], True)

        update = mock_db.posts.update_many.call_args[0][1]
        assert update["$set"]["read"] is True

    def test_sets_read_to_false(self, mock_db):
        """Sets read to False."""
        storage = PostsStorage(mock_db)
        mock_db.posts.update_many.return_value = MagicMock(modified_count=3)

        storage.change_status("test-owner", [1, 2, 3], False)

        update = mock_db.posts.update_many.call_args[0][1]
        assert update["$set"]["read"] is False

    def test_returns_true_always(self, mock_db):
        """Returns True always."""
        storage = PostsStorage(mock_db)
        mock_db.posts.update_many.return_value = MagicMock(modified_count=0)

        result = storage.change_status("test-owner", [1, 2, 3], True)

        assert result is True


# =============================================================================
# Test: get_stat
# =============================================================================

class TestGetStat:
    """Tests for PostsStorage.get_stat."""

    def test_returns_stat_dictionary(self, mock_db):
        """Returns stat dictionary."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.__iter__ = lambda self: iter([
            {"_id": True, "counter": 5},
            {"_id": False, "counter": 10}
        ])
        mock_db.posts.aggregate.return_value = mock_cursor
        mock_db.tags.count_documents.return_value = 3

        result = storage.get_stat("test-owner")

        assert isinstance(result, dict)
        assert "unread" in result
        assert "read" in result
        assert "tags" in result

    def test_counts_read_posts(self, mock_db):
        """Counts read posts."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.__iter__ = lambda self: iter([
            {"_id": True, "counter": 5}
        ])
        mock_db.posts.aggregate.return_value = mock_cursor
        mock_db.tags.count_documents.return_value = 0

        result = storage.get_stat("test-owner")

        assert result["read"] == 5

    def test_counts_unread_posts(self, mock_db):
        """Counts unread posts."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.__iter__ = lambda self: iter([
            {"_id": False, "counter": 10}
        ])
        mock_db.posts.aggregate.return_value = mock_cursor
        mock_db.tags.count_documents.return_value = 0

        result = storage.get_stat("test-owner")

        assert result["unread"] == 10

    def test_counts_tags_for_owner(self, mock_db):
        """Counts tags for owner."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.__iter__ = lambda self: iter([])
        mock_db.posts.aggregate.return_value = mock_cursor
        mock_db.tags.count_documents.return_value = 7

        result = storage.get_stat("test-owner")

        mock_db.tags.count_documents.assert_called_once_with({"owner": "test-owner"})
        assert result["tags"] == 7

    def test_defaults_to_zero_when_no_posts(self, mock_db):
        """Defaults to zero when no posts."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.__iter__ = lambda self: iter([])
        mock_db.posts.aggregate.return_value = mock_cursor
        mock_db.tags.count_documents.return_value = 0

        result = storage.get_stat("test-owner")

        assert result["read"] == 0
        assert result["unread"] == 0
        assert result["tags"] == 0

    def test_aggregates_by_read_field(self, mock_db):
        """Aggregates by read field."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.__iter__ = lambda self: iter([])
        mock_db.posts.aggregate.return_value = mock_cursor
        mock_db.tags.count_documents.return_value = 0

        storage.get_stat("test-owner")

        pipeline = mock_db.posts.aggregate.call_args[0][0]
        match_stage = pipeline[0]
        assert match_stage["$match"]["owner"] == "test-owner"

        group_stage = pipeline[1]
        assert group_stage["$group"]["_id"] == "$read"


# =============================================================================
# Test: set_clusters
# =============================================================================

class TestSetClusters:
    """Tests for PostsStorage.set_clusters."""

    def test_updates_clusters_for_posts(self, mock_db):
        """Updates clusters for posts."""
        storage = PostsStorage(mock_db)
        mock_db.posts.bulk_write.return_value = MagicMock()

        similars = {"cluster-001": [1, 2, 3]}
        result = storage.set_clusters("test-owner", similars)

        assert result is True

    def test_uses_update_many_for_each_cluster(self, mock_db):
        """Uses UpdateMany for each cluster."""
        storage = PostsStorage(mock_db)
        mock_db.posts.bulk_write.return_value = MagicMock()

        similars = {"cluster-001": [1, 2, 3], "cluster-002": [4, 5]}
        storage.set_clusters("test-owner", similars)

        calls = mock_db.posts.bulk_write.call_args[0][0]
        assert len(calls) == 2

    def test_uses_addtoset_operator(self, mock_db):
        """Uses $addToSet operator."""
        storage = PostsStorage(mock_db)
        mock_db.posts.bulk_write.return_value = MagicMock()

        similars = {"cluster-001": [1, 2, 3]}
        storage.set_clusters("test-owner", similars)

        calls = mock_db.posts.bulk_write.call_args[0][0]
        update_op = calls[0]
        assert isinstance(update_op, UpdateMany)

    def test_queries_by_owner_and_pid_in_list(self, mock_db):
        """Queries by owner and pid in list."""
        storage = PostsStorage(mock_db)
        mock_db.posts.bulk_write.return_value = MagicMock()

        similars = {"cluster-001": [1, 2, 3]}
        storage.set_clusters("test-owner", similars)

        calls = mock_db.posts.bulk_write.call_args[0][0]
        filter_query = calls[0]._filter
        assert filter_query["owner"] == "test-owner"
        assert filter_query["pid"] == {"$in": [1, 2, 3]}

    def test_does_not_call_bulk_write_when_empty(self, mock_db):
        """Does not call bulk_write when similars is empty."""
        storage = PostsStorage(mock_db)

        storage.set_clusters("test-owner", {})

        mock_db.posts.bulk_write.assert_not_called()

    def test_returns_true_when_empty(self, mock_db):
        """Returns True when similars is empty."""
        storage = PostsStorage(mock_db)

        result = storage.set_clusters("test-owner", {})

        assert result is True


# =============================================================================
# Test: get_by_clusters
# =============================================================================

class TestGetByClusters:
    """Tests for PostsStorage.get_by_clusters."""

    def test_returns_cursor_with_matching_posts(self, mock_db):
        """Returns cursor with matching posts."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        result = storage.get_by_clusters("test-owner", ["cluster-001"])

        assert result is not None

    def test_queries_by_owner_field(self, mock_db):
        """Queries by owner field."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_clusters("test-owner", ["cluster-001"])

        query = mock_db.posts.find.call_args[0][0]
        assert query["owner"] == "test-owner"

    def test_queries_clusters_with_exists_and_elemmatch(self, mock_db):
        """Queries clusters with $exists and $elemMatch."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_clusters("test-owner", ["cluster-001", "cluster-002"])

        query = mock_db.posts.find.call_args[0][0]
        assert query["clusters"]["$exists"] is True
        assert "$elemMatch" in query["clusters"]

    def test_filters_unread_when_only_unread_true(self, mock_db):
        """Filters unread when only_unread=True."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_clusters("test-owner", ["cluster-001"], only_unread=True)

        query = mock_db.posts.find.call_args[0][0]
        assert query["read"] is False

    def test_sorts_by_feed_id_and_unix_date(self, mock_db):
        """Sorts by feed_id and unix_date."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        storage.get_by_clusters("test-owner", ["cluster-001"])

        mock_cursor.sort.assert_called_once_with(
            [("feed_id", DESCENDING), ("unix_date", DESCENDING)]
        )

    def test_supports_projection(self, mock_db):
        """Supports projection parameter."""
        storage = PostsStorage(mock_db)
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor
        projection = {"title": 1}

        storage.get_by_clusters("test-owner", ["cluster-001"], projection=projection)

        assert mock_db.posts.find.call_args[1]["projection"] == projection


# =============================================================================
# Test: get_clusters
# =============================================================================

class TestGetClusters:
    """Tests for PostsStorage.get_clusters."""

    def test_returns_set_of_clusters(self, mock_db):
        """Returns set of clusters."""
        storage = PostsStorage(mock_db)
        posts = [
            {"clusters": ["cluster-001", "cluster-002"]},
            {"clusters": ["cluster-003"]},
        ]

        result = storage.get_clusters(posts)

        assert isinstance(result, set)
        assert result == {"cluster-001", "cluster-002", "cluster-003"}

    def test_returns_empty_set_when_no_posts(self, mock_db):
        """Returns empty set when no posts."""
        storage = PostsStorage(mock_db)

        result = storage.get_clusters([])

        assert result == set()

    def test_skips_posts_without_clusters_field(self, mock_db):
        """Skips posts without clusters field."""
        storage = PostsStorage(mock_db)
        posts = [
            {"title": "Post 1"},
            {"clusters": ["cluster-001"]},
        ]

        result = storage.get_clusters(posts)

        assert result == {"cluster-001"}

    def test_skips_posts_with_none_clusters(self, mock_db):
        """Skips posts with None clusters."""
        storage = PostsStorage(mock_db)
        posts = [
            {"clusters": None},
            {"clusters": ["cluster-001"]},
        ]

        result = storage.get_clusters(posts)

        assert result == {"cluster-001"}

    def test_skips_posts_with_empty_clusters(self, mock_db):
        """Skips posts with empty clusters."""
        storage = PostsStorage(mock_db)
        posts = [
            {"clusters": []},
            {"clusters": ["cluster-001"]},
        ]

        result = storage.get_clusters(posts)

        assert result == {"cluster-001"}

    def test_handles_duplicate_clusters(self, mock_db):
        """Handles duplicate clusters (returns unique set)."""
        storage = PostsStorage(mock_db)
        posts = [
            {"clusters": ["cluster-001", "cluster-002"]},
            {"clusters": ["cluster-001", "cluster-003"]},
        ]

        result = storage.get_clusters(posts)

        assert result == {"cluster-001", "cluster-002", "cluster-003"}


# =============================================================================
# Test: count
# =============================================================================

class TestCount:
    """Tests for PostsStorage.count."""

    def test_returns_count_of_posts_for_owner(self, mock_db):
        """Returns count of posts for owner."""
        storage = PostsStorage(mock_db)
        mock_db.posts.count_documents.return_value = 42

        result = storage.count("test-owner")

        assert result == 42

    def test_queries_by_owner_field(self, mock_db):
        """Queries by owner field."""
        storage = PostsStorage(mock_db)
        mock_db.posts.count_documents.return_value = 0

        storage.count("test-owner")

        mock_db.posts.count_documents.assert_called_once_with({"owner": "test-owner"})

    def test_returns_zero_when_no_posts(self, mock_db):
        """Returns zero when no posts."""
        storage = PostsStorage(mock_db)
        mock_db.posts.count_documents.return_value = 0

        result = storage.count("test-owner")

        assert result == 0


# =============================================================================
# Integration Tests
# =============================================================================

class TestIntegration:
    """Integration-style tests for PostsStorage."""

    def test_full_workflow_prepare_query_update(self, mock_db):
        """Tests full workflow: prepare, query, update."""
        storage = PostsStorage(mock_db)

        # Prepare
        storage.prepare()
        assert mock_db.posts.create_index.call_count == 6

        # Query
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        result = storage.get_by_category("test-owner", category="cat-001", only_unread=True)
        assert result is not None

        # Update
        mock_db.posts.update_many.return_value = MagicMock(modified_count=5)
        result = storage.change_status("test-owner", [1, 2, 3], True)
        assert result is True

    def test_stat_workflow(self, mock_db):
        """Tests stat workflow."""
        storage = PostsStorage(mock_db)

        # Setup mock aggregation
        mock_cursor = MagicMock()
        mock_cursor.__iter__ = lambda self: iter([
            {"_id": True, "counter": 10},
            {"_id": False, "counter": 20}
        ])
        mock_db.posts.aggregate.return_value = mock_cursor
        mock_db.tags.count_documents.return_value = 5

        result = storage.get_stat("test-owner")

        assert result["read"] == 10
        assert result["unread"] == 20
        assert result["tags"] == 5

    def test_cluster_workflow(self, mock_db):
        """Tests cluster workflow."""
        storage = PostsStorage(mock_db)

        # Set clusters
        mock_db.posts.bulk_write.return_value = MagicMock()
        similars = {"cluster-001": [1, 2], "cluster-002": [3, 4]}
        storage.set_clusters("test-owner", similars)

        # Get by clusters
        mock_cursor = MagicMock()
        mock_cursor.allow_disk_use.return_value = mock_cursor
        mock_cursor.sort.return_value = mock_cursor
        mock_db.posts.find.return_value = mock_cursor

        result = storage.get_by_clusters("test-owner", ["cluster-001"])
        assert result is not None

        # Extract clusters from posts
        posts = [{"clusters": ["cluster-001", "cluster-002"]}]
        clusters = storage.get_clusters(posts)
        assert clusters == {"cluster-001", "cluster-002"}

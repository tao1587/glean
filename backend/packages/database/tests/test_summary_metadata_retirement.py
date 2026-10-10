"""Application schema creation excludes retired summary storage."""

from sqlalchemy import create_mock_engine
from sqlalchemy.schema import CreateTable

from glean_database import Base


def test_schema_creation_keeps_reader_tables_without_summary_storage() -> None:
    created_tables: list[str] = []

    def collect_table(statement: object, *_args: object, **_kwargs: object) -> None:
        if isinstance(statement, CreateTable):
            created_tables.append(statement.element.name)

    engine = create_mock_engine("postgresql://", collect_table)
    Base.metadata.create_all(engine)

    assert {"users", "feeds", "entries", "entry_translations"} <= set(created_tables)
    assert not {"ai_daily_summaries", "ai_entry_supplements"} & set(created_tables)

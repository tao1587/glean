"""
Embedding validation service.

Provides validation for embedding providers and pgvector availability
before enabling vectorization.
"""

from typing import TYPE_CHECKING

from glean_core import get_logger
from glean_core.schemas.config import EmbeddingConfig, ValidationResult

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)


class EmbeddingValidationService:
    """
    Service for validating embedding configuration.

    Tests provider connections and Milvus availability before
    enabling vectorization to ensure the system will work correctly.
    """

    TEST_TEXT = "This is a test sentence for embedding validation."

    async def infer_dimension(
        self, provider: str, model: str, api_key: str | None = None, base_url: str | None = None
    ) -> ValidationResult:
        """
        Infer embedding dimension by testing the provider.

        Args:
            provider: Embedding provider name
            model: Model name
            api_key: Optional API key
            base_url: Optional base URL

        Returns:
            ValidationResult with inferred dimension in details
        """
        try:
            from glean_vector.clients.embedding_factory import EmbeddingProviderFactory
            from glean_vector.config import EmbeddingConfig as EmbeddingSettings

            # Build minimal settings (dimension will be set to a placeholder)
            settings = EmbeddingSettings(
                provider=provider,
                model=model,
                dimension=1536,  # Placeholder, will be inferred
                api_key=api_key or "",
                base_url=base_url,
            )

            provider_instance = EmbeddingProviderFactory.create(config=settings)

            try:
                # Generate test embedding to infer dimension
                embedding, metadata = await provider_instance.generate_embedding(self.TEST_TEXT)
                actual_dimension = len(embedding)

                logger.info(f"Inferred dimension for {provider}/{model}: {actual_dimension}")
                return ValidationResult(
                    success=True,
                    message=f"Successfully inferred dimension: {actual_dimension}",
                    details={
                        "provider": provider,
                        "model": model,
                        "dimension": actual_dimension,
                        "metadata": metadata,
                    },
                )

            finally:
                await provider_instance.close()

        except Exception as e:
            logger.error(f"Failed to infer dimension: {e}")
            return ValidationResult(
                success=False,
                message=f"Failed to infer dimension: {str(e)}",
                details={"provider": provider, "model": model, "error": str(e)},
            )

    async def validate_provider(self, config: EmbeddingConfig) -> ValidationResult:
        """
        Test embedding provider connection with a sample request.

        Args:
            config: Embedding configuration to test.

        Returns:
            ValidationResult with success status and details.
        """
        try:
            from glean_vector.clients.embedding_factory import EmbeddingProviderFactory
            from glean_vector.config import EmbeddingConfig as EmbeddingSettings

            # Build settings from config
            settings = EmbeddingSettings(
                provider=config.provider,
                model=config.model,
                dimension=config.dimension,
                api_key=config.api_key or "",
                base_url=config.base_url,
                timeout=config.timeout,
                batch_size=config.batch_size,
                max_retries=config.max_retries,
            )

            # Create provider
            provider = EmbeddingProviderFactory.create(config=settings)

            try:
                # Generate test embedding
                embedding, metadata = await provider.generate_embedding(self.TEST_TEXT)

                # Validate dimension
                actual_dimension = len(embedding)
                if actual_dimension != config.dimension:
                    logger.warning(
                        f"Dimension mismatch: expected {config.dimension}, got {actual_dimension}"
                    )
                    return ValidationResult(
                        success=False,
                        message=f"Dimension mismatch: expected {config.dimension}, got {actual_dimension}",
                        details={
                            "expected_dimension": config.dimension,
                            "actual_dimension": actual_dimension,
                            "provider": config.provider,
                            "model": config.model,
                        },
                    )

                logger.info(f"Provider validation successful: {config.provider}/{config.model}")
                return ValidationResult(
                    success=True,
                    message="Provider connection successful",
                    details={
                        "provider": config.provider,
                        "model": config.model,
                        "dimension": actual_dimension,
                        "metadata": metadata,
                    },
                )

            finally:
                await provider.close()

        except ImportError as e:
            logger.error(f"Provider import error: {e}")
            return ValidationResult(
                success=False,
                message=f"Provider not available: {config.provider}. {str(e)}",
                details={"provider": config.provider, "error": str(e)},
            )

        except Exception as e:
            logger.error(f"Provider validation failed: {e}")
            return ValidationResult(
                success=False,
                message=f"Provider connection failed: {str(e)}",
                details={
                    "provider": config.provider,
                    "model": config.model,
                    "error": str(e),
                    "error_type": type(e).__name__,
                },
            )

    async def validate_pgvector(
        self,
        session: "AsyncSession",
        dimension: int | None = None,
        provider: str | None = None,
        model: str | None = None,
    ) -> ValidationResult:
        """
        Check that the pgvector extension is installed and tables exist.

        Args:
            session: Async database session.
            dimension: Optional dimension (informational).
            provider: Optional embedding provider (informational).
            model: Optional model name (informational).

        Returns:
            ValidationResult with success status and details.
        """
        try:
            from sqlalchemy import text

            # Check extension
            result = await session.execute(
                text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
            )
            ext_row = result.fetchone()
            if not ext_row:
                return ValidationResult(
                    success=False,
                    message="pgvector extension is not installed in the database",
                    details={"error": "extension 'vector' not found"},
                )

            # Check tables exist
            result = await session.execute(text("SELECT 1 FROM entry_embeddings LIMIT 0"))
            entries_ok = True

            logger.info("pgvector validation successful")
            return ValidationResult(
                success=True,
                message="pgvector connection successful",
                details={
                    "extension": "vector",
                    "entry_embeddings_table": entries_ok,
                    "dimension": dimension,
                    "provider": provider,
                    "model": model,
                },
            )

        except Exception as e:
            logger.error(f"pgvector validation failed: {e}")
            return ValidationResult(
                success=False,
                message=f"pgvector check failed: {str(e)}",
                details={
                    "error": str(e),
                    "error_type": type(e).__name__,
                },
            )

    async def check_provider_health(self, config: EmbeddingConfig) -> bool:
        """
        Quick health check for the embedding provider.

        Args:
            config: Embedding configuration.

        Returns:
            True if provider is healthy, False otherwise.
        """
        result = await self.validate_provider(config)
        return result.success

    async def validate_full(
        self,
        config: EmbeddingConfig,
        session: "AsyncSession",
    ) -> ValidationResult:
        """Validate both the provider and pgvector persistence layer."""
        provider_result = await self.validate_provider(config)
        if not provider_result.success:
            return provider_result

        pgvector_result = await self.validate_pgvector(
            session,
            dimension=config.dimension,
            provider=config.provider,
            model=config.model,
        )
        if not pgvector_result.success:
            return pgvector_result

        details = {
            "provider": provider_result.details,
            "pgvector": pgvector_result.details,
        }
        return ValidationResult(
            success=True,
            message="Provider and pgvector validation successful",
            details=details,
        )

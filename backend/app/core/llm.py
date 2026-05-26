from openai import AsyncOpenAI
from typing import AsyncGenerator
import os

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set in environment")
        _client = AsyncOpenAI(api_key=api_key)
    return _client


async def call_agent(
    system_prompt: str,
    user_message: str,
    model: str = "gpt-4o-mini",
    temperature: float = 0.7,
) -> AsyncGenerator[str, None]:
    """Streams tokens from an LLM call for a single agent."""
    client = get_client()
    stream = await client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta

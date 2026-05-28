FROM public.ecr.aws/docker/library/python:3.12-slim

WORKDIR /app

# Install curl and ca-certificates for healthchecks and TLS
RUN apt-get update && apt-get install -y --no-install-recommends \
		curl \
		ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONPATH=/app

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8099"]
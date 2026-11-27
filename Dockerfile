FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOST=0.0.0.0 PORT=3000 \
    MODEL_PATH=/app/models/base HF_HUB_DISABLE_XET=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt get_model.py ./
RUN pip install --no-cache-dir -r requirements.txt && python get_model.py /app/models/base \
    && rm -rf /app/models/base/.cache /root/.cache/huggingface
COPY server.py ./
COPY public ./public
ENV HF_HUB_OFFLINE=1
USER 65534:65534
EXPOSE 3000
CMD ["python", "server.py"]

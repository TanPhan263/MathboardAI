FROM python:3.13-slim

WORKDIR /srv
ENV PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 MC_DATA_DIR=/data

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

COPY app app
COPY ml ml
COPY models models

# Learner samples, personal models and jobs. Mount a volume here.
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

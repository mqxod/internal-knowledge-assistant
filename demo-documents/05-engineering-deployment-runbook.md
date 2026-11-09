# Engineering Deployment Runbook

> Fictional document for demonstration purposes.

## Overview

This runbook describes how the Platform team deploys the Brightwave web services to production. Deployments run through the CI/CD pipeline; manual changes to production infrastructure are not allowed.

## Deployment Windows

Production deployments are allowed Monday to Thursday between 09:00 and 16:00 CET. Deployments on Fridays, weekends, and public holidays require approval from the on-call engineering manager.

## Pre-Deployment Checklist

Before deploying, confirm that:

1. All CI checks are green on the release branch.
2. Database migrations have been reviewed by a second engineer.
3. The change has been verified in the staging environment.
4. A rollback plan is documented in the release ticket.

## Deploying to Production

Trigger the "Deploy production" workflow in the pipeline with the release tag (for example `v2.14.0`). The pipeline performs a rolling deployment, replacing 25% of instances at a time and waiting for health checks to pass before continuing.

## Monitoring After Deployment

Watch the Production Overview dashboard for 30 minutes after a deployment. Key signals are the HTTP 5xx error rate (alert threshold: 1%), p95 latency (alert threshold: 800 ms), and queue backlog.

## Rolling Back

If error rates exceed the alert threshold, roll back immediately by re-running the "Deploy production" workflow with the previous release tag. Rollbacks do not need approval. Database migrations are written to be backwards compatible so that a rollback never requires a schema downgrade.

## Incident Escalation

If a rollback does not restore service within 15 minutes, page the on-call engineer through the incident tool and open an incident channel named `#inc-<date>-<short-name>`.

"""Optional anonymous-device backups. No school accounts, seat counts or AWS keys in the UI."""
import base64
import hashlib
import json
import os
import re
import time
from datetime import datetime, timezone

_table = None
TTL_SECONDS = 90 * 24 * 60 * 60


def table():
    global _table
    if _table is None:
        import boto3  # Included in the managed AWS Python runtime.
        _table = boto3.resource('dynamodb').Table(os.environ['TABLE_NAME'])
    return _table


def stamp(value):
    if not isinstance(value, str) or len(value) > 40:
        return False
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.tzinfo is not None
    except ValueError:
        return False


def matches(pattern, value):
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None


def validate_backup(data):
    if not isinstance(data, dict) or data.get('format') != 'courseflow-watchlist' or type(data.get('version')) is not int or data['version'] != 2:
        raise ValueError('Use a version 2 CourseFlow backup.')
    watches, searches = data.get('watches'), data.get('searches')
    if not isinstance(watches, list) or not isinstance(searches, list) or len(watches) > 20 or len(searches) > 20:
        raise ValueError('Backups support at most 20 watches and 20 searches.')
    for item in watches + searches:
        if not isinstance(item, dict) or not matches(r'\d{6}', item.get('term')) or not matches(r'[A-Z]{2,6}\d{4}[A-Z]?', item.get('code')):
            raise ValueError('Invalid saved course.')
    for item in watches:
        if not matches(r'\d{1,10}', item.get('crn')) or type(item.get('threshold')) is not int or not 1 <= item['threshold'] <= 100 or type(item.get('enabled')) is not bool:
            raise ValueError('Invalid watch configuration.')
    for item in searches:
        if not isinstance(item.get('termLabel'), str) or len(item['termLabel']) > 200 or not stamp(item.get('searchedAt')):
            raise ValueError('Invalid search history.')
    # Whitelist fields. Backups cannot inject seat counts, external URLs or chat transcripts.
    return {'format': 'courseflow-watchlist', 'version': 2,
            'watches': [{key: item[key] for key in ('term', 'code', 'crn', 'threshold', 'enabled')} for item in watches],
            'searches': [{key: item[key] for key in ('term', 'code', 'termLabel', 'searchedAt')} for item in searches]}


def handler(event, context):
    headers = {key.lower(): value for key, value in (event.get('headers') or {}).items()}
    origin = os.environ.get('ALLOWED_ORIGIN', 'https://wangcb424.github.io')
    allowed = headers.get('origin') in (None, origin)
    response_headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
                        'X-Content-Type-Options': 'nosniff'}
    if allowed:
        response_headers.update({'Access-Control-Allow-Origin': origin,
                                 'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
                                 'Access-Control-Allow-Headers': 'authorization,content-type,if-match'})

    def reply(status, body):
        return {'statusCode': status, 'headers': response_headers, 'body': json.dumps(body)}

    if not allowed:
        return reply(403, {'message': 'Origin is not allowed.'})
    if event.get('rawPath') != '/backup':
        return reply(404, {'message': 'Not found.'})
    method = event.get('requestContext', {}).get('http', {}).get('method')
    if method == 'OPTIONS':
        return reply(204, {})
    if method not in ('GET', 'PUT', 'DELETE'):
        return reply(405, {'message': 'Method not allowed.'})
    token = headers.get('authorization', '')
    if not matches(r'Bearer [0-9a-f]{64}', token):
        return reply(401, {'message': 'A valid device backup key is required.'})
    pk = hashlib.sha256(token[7:].encode()).hexdigest()
    now = int(time.time())
    try:
        if method == 'GET':
            item = table().get_item(Key={'pk': pk}, ConsistentRead=True).get('Item')
            if not item or int(item['expiresAt']) <= now:
                return reply(200, {'version': 0, 'backup': None})
            return reply(200, {'version': int(item['revision']), 'backup': json.loads(item['payload']),
                               'updatedAt': item['updatedAt'], 'expiresAt': int(item['expiresAt'])})
        expected = headers.get('if-match', '')
        if not matches(r'0|[1-9]\d{0,8}', expected):
            return reply(428, {'message': 'Read the latest backup before changing it.'})
        revision = int(expected)
        values = {':now': now}
        condition = 'attribute_not_exists(pk) OR expiresAt <= :now'
        if revision:
            condition = 'revision = :expected AND expiresAt > :now'
            values[':expected'] = revision
        if method == 'DELETE':
            table().delete_item(Key={'pk': pk}, ConditionExpression=condition, ExpressionAttributeValues=values)
            return reply(200, {'deleted': True})
        raw = event.get('body') or ''
        if len(raw) > 140000:
            return reply(413, {'message': 'Backup is too large.'})
        if event.get('isBase64Encoded'):
            raw = base64.b64decode(raw, validate=True).decode('utf-8')
        if len(raw.encode('utf-8')) > 100000:
            return reply(413, {'message': 'Backup is too large.'})
        backup = validate_backup(json.loads(raw))
        updated = datetime.now(timezone.utc).isoformat()
        table().put_item(Item={'pk': pk, 'revision': revision + 1, 'payload': json.dumps(backup),
                               'updatedAt': updated, 'expiresAt': now + TTL_SECONDS},
                         ConditionExpression=condition, ExpressionAttributeValues=values)
        return reply(200, {'version': revision + 1, 'updatedAt': updated})
    except (ValueError, TypeError, UnicodeError):
        return reply(400, {'message': 'The backup is invalid. Local data has not changed.'})
    except Exception as error:
        code = getattr(error, 'response', {}).get('Error', {}).get('Code', '')
        if code == 'ConditionalCheckFailedException':
            return reply(409, {'message': 'The cloud backup changed in another tab. Read it again before saving.'})
        # No tokens, request bodies, or database details in logs or responses.
        return reply(503, {'message': 'Cloud backup is unavailable. Your local saved data is still available.'})

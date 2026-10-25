import copy
import json
import unittest
from unittest.mock import patch
from cloud import app


class Conflict(Exception):
    response = {'Error': {'Code': 'ConditionalCheckFailedException'}}


class FakeTable:
    """Dependency boundary only; AWS deployment is a separate verification step."""
    def __init__(self):
        self.rows = {}

    def get_item(self, Key, ConsistentRead):
        assert ConsistentRead
        return {'Item': self.rows[Key['pk']]} if Key['pk'] in self.rows else {}

    def check(self, pk, condition, values):
        item = self.rows.get(pk)
        expired = not item or item['expiresAt'] <= values[':now']
        if ':expected' in values:
            if expired or item['revision'] != values[':expected']:
                raise Conflict()
        elif not expired:
            raise Conflict()

    def put_item(self, Item, ConditionExpression, ExpressionAttributeValues):
        self.check(Item['pk'], ConditionExpression, ExpressionAttributeValues)
        self.rows[Item['pk']] = copy.deepcopy(Item)

    def delete_item(self, Key, ConditionExpression, ExpressionAttributeValues):
        self.check(Key['pk'], ConditionExpression, ExpressionAttributeValues)
        self.rows.pop(Key['pk'], None)


class BackupTests(unittest.TestCase):
    def setUp(self):
        app._table = FakeTable()
        self.backup = {'format': 'courseflow-watchlist', 'version': 2,
                       'watches': [{'term': '202710', 'code': 'CS3100', 'crn': '17206', 'threshold': 2, 'enabled': True}],
                       'searches': [{'term': '202710', 'code': 'CS3100', 'termLabel': 'Fall 2026', 'searchedAt': '2026-10-25T12:00:00Z'}]}

    def call(self, method, token='a'*64, revision=None, body=None, origin='https://wangcb424.github.io', **fields):
        headers = {'Authorization': 'Bearer '+token, 'Origin': origin}
        if revision is not None:
            headers['If-Match'] = str(revision)
        event = {'rawPath': '/backup', 'headers': headers, 'requestContext': {'http': {'method': method}},
                 'body': json.dumps(body) if body is not None else ''}
        event.update(fields)
        result = app.handler(event, None)
        return result['statusCode'], json.loads(result['body']), result['headers']

    def test_roundtrip_private_key_and_delete(self):
        self.assertEqual(self.call('GET')[1], {'version': 0, 'backup': None})
        self.assertEqual(self.call('PUT', revision=0, body=self.backup)[0], 200)
        data = self.call('GET')[1]
        self.assertEqual(data['backup'], self.backup)
        self.assertEqual(data['version'], 1)
        self.assertIsNone(self.call('GET', token='b'*64)[1]['backup'])
        self.assertNotIn('a'*64, json.dumps(app._table.rows))
        self.assertEqual(self.call('DELETE', revision=1)[0], 200)
        self.assertIsNone(self.call('GET')[1]['backup'])

    def test_optimistic_conflicts_preserve_newer_data(self):
        self.call('PUT', revision=0, body=self.backup)
        changed = copy.deepcopy(self.backup); changed['watches'][0]['threshold'] = 4
        self.assertEqual(self.call('PUT', revision=1, body=changed)[0], 200)
        self.assertEqual(self.call('PUT', revision=1, body=self.backup)[0], 409)
        self.assertEqual(self.call('DELETE', revision=1)[0], 409)
        self.assertEqual(self.call('GET')[1]['backup'], changed)
        self.assertEqual(self.call('PUT', body=self.backup)[0], 428)

    def test_expired_record_is_not_restored_and_can_be_replaced(self):
        self.call('PUT', revision=0, body=self.backup)
        for item in app._table.rows.values():
            item['expiresAt'] = 1
        self.assertIsNone(self.call('GET')[1]['backup'])
        self.assertEqual(self.call('PUT', revision=0, body=self.backup)[0], 200)

    def test_invalid_requests_never_touch_database(self):
        for token in ('', '1', 'x'*64):
            self.assertEqual(self.call('GET', token=token)[0], 401)
        self.assertEqual(self.call('PUT', origin='https://other.example', revision=0, body=self.backup)[0], 403)
        self.assertEqual(self.call('POST')[0], 405)
        self.assertEqual(self.call('GET', rawPath='/other')[0], 404)
        self.assertEqual(self.call('OPTIONS')[0], 204)
        self.assertEqual(app._table.rows, {})

    def test_validation_limits_and_untrusted_fields(self):
        for mutation in [lambda b: b['watches'][0].update(threshold=True),
                         lambda b: b['watches'][0].update(crn='../other'),
                         lambda b: b['searches'][0].update(searchedAt='bad'),
                         lambda b: b.update(searches=b['searches']*21),
                         lambda b: b.update(version=True)]:
            invalid = copy.deepcopy(self.backup); mutation(invalid)
            self.assertEqual(self.call('PUT', revision=0, body=invalid)[0], 400)
        self.backup['watches'][0]['available'] = 999
        self.backup['secret'] = 'must not be stored'
        self.call('PUT', revision=0, body=self.backup)
        saved = self.call('GET')[1]['backup']
        self.assertNotIn('available', saved['watches'][0])
        self.assertNotIn('secret', saved)

    def test_large_malformed_and_base64_bodies(self):
        import base64
        self.assertEqual(self.call('PUT', revision=0, **{'body': None, 'isBase64Encoded': True})[0], 400)
        event = {'rawPath': '/backup', 'headers': {'authorization': 'Bearer '+'a'*64, 'if-match': '0'},
                 'requestContext': {'http': {'method': 'PUT'}}, 'body': 'x'*140001}
        self.assertEqual(app.handler(event, None)['statusCode'], 413)
        event.update(body=base64.b64encode(json.dumps(self.backup).encode()).decode(), isBase64Encoded=True)
        self.assertEqual(app.handler(event, None)['statusCode'], 200)

    def test_database_failure_and_cors_do_not_leak_details(self):
        with patch.object(app._table, 'get_item', side_effect=RuntimeError('secret internal table')):
            status, body, headers = self.call('GET')
        self.assertEqual(status, 503)
        self.assertNotIn('secret', json.dumps(body))
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(headers['Access-Control-Allow-Origin'], 'https://wangcb424.github.io')
        self.assertNotIn('Access-Control-Allow-Credentials', headers)


if __name__ == '__main__':
    unittest.main()

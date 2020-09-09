"""
 This is the default license template.
 
 File: lambda.py
 Author: angmas
 Copyright (c) 2020 angmas
 
 To edit this license information: Press Ctrl+Shift+P and press 'Create new License Template...'.
"""

import greengrasssdk
import re
import logging
import os
import json
import time

THING_NAME = os.environ['THING_NAME']
print(os.environ)
iot_client = greengrasssdk.client('iot-data')
new_job_re = re.compile(f'\$aws/things/{THING_NAME}/jobs/notify.?next')
start_next_re = re.compile(f'\$aws/things/{THING_NAME}/jobs/start.?next/(.*)')
job_state_re = re.compile(f'\$aws/things/{THING_NAME}/jobs/(.*)/update/(.*)')

current_job_id = None

class JobExecutionStatus:
    SUCCEEDED = 'SUCCEEDED'
    IN_PROGRESS = 'IN_PROGRESS'
    FAILED = 'FAILED'
    REJECTED = 'REJECTED'

def start_next_job():
    payload = {}
    iot_client.publish(
        topic=f'$aws/things/{THING_NAME}/jobs/start-next', payload=json.dumps(payload))
    iot_client.publish(
        topic=f'test/jobs/start-next', payload=json.dumps(payload))

def update_job_execution(job_id, execution, status, details):
    update_payload = {
            "status": status,
            "statusDetails": details,
            "expectedVersion": execution['versionNumber'],
            "executionNumber": execution['executionNumber'],
            "includeJobExecutionState": False,
            "includeJobDocument": False,
            "stepTimeoutInMinutes": 5
        }
    
    iot_client.publish(
        topic=f'$aws/things/{THING_NAME}/jobs/{job_id}/update', payload=json.dumps(update_payload))
    if status != JobExecutionStatus.IN_PROGRESS:
        current_job_id = None

def get_input_topic(context):
    try:
        topic = context.client_context.custom['subject']
    except Exception as e:
        logging.error('Topic could not be parsed. ' + repr(e))
    return topic

def process_job(event):
    print(event)
    if not 'execution' in event:
        # There are no jobs
        t = time.ctime(event['timestamp'])
        print(f'There are no job at {t}')
        return
    execution = event['execution']
    job_id = execution['jobId']
    current_job_id = job_id
    details = {
                "myState": "done"
            }
    
    update_job_execution(job_id, execution, JobExecutionStatus.SUCCEEDED, details)

def handler(event, context):
    topic = get_input_topic(context)
    print(f'Got msg {event} on topic {topic}')
    if 'rejected' in topic:
        print('Job command has been rejected')
        print(event)
        # One may want to do something if an update has been rejected
        return
    if new_job_re.match(topic):
        process_job(event)
        return
    if start_next_re.match(topic):
        
        process_job(event)
        return
    if job_state_re.match(topic):
        print('Update accepted')
        print(event)

start_next_job()

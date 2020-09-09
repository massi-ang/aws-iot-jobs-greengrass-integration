/* 
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: MIT-0
 */

import * as cdk from '@aws-cdk/core';
import * as gg from 'greengrass-cdk'
import * as lambda from '@aws-cdk/aws-lambda'
import { RemovalPolicy, Size, BundlingDockerImage } from '@aws-cdk/core';
import * as iot from '@aws-cdk/aws-iot';
import { Subscriptions, LocalUserLambdaLogger, Logger, LocalGreengrassLogger, AWSIoTCloud } from 'greengrass-cdk';



export class GgStackStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const image = BundlingDockerImage.fromRegistry('python:3.7-buster')
    const certificateArn = new cdk.CfnParameter(this, 'certificateArnCore', {
      type: 'String',
      description: 'The certificateArn for the core thing'
    }) 

    const gg_lambda = new lambda.Function(this, 'gg_lambda', {
      code: lambda.Code.fromAsset('../gg_jobs_lambda/src', {
        bundling: {
          image: image,
          command: ['bash', '-c', 'cd /asset-input && cp -r * /asset-output && cd /asset-output && pip install -r requirements.txt -t .']
        }
      }),
      runtime: lambda.Runtime.PYTHON_3_7,
      handler: 'lambda.handler',
      currentVersionOptions: {
        removalPolicy: RemovalPolicy.RETAIN
      }
    })
    let alias = new lambda.Alias(this, 'prod_alias', {
      version: gg_lambda.currentVersion,
      aliasName: 'prod',
    });

    let thing = new iot.CfnThing(this, 'core_thing', {
      thingName: 'gg_core'
    })

    let policy = new iot.CfnPolicy(this, 'gg_policy', {
      policyName: "GGPolicy",
      policyDocument: {
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Action": [
              "iot:Connect"
            ],
            "Resource": [
              "*"
            ]
          },
          {
            "Effect": "Allow",
            "Action": [
              "iot:Publish",
              "iot:Subscribe",
              "iot:Receive"
            ],
            "Resource": [
              "*"
            ]
          },
          {
            "Effect": "Allow",
            "Action": [
              "iot:GetThingShadow",
              "iot:UpdateThingShadow",
              "iot:DeleteThingShadow"
            ],
            "Resource": [
              "*"
            ]
          },
          {
            "Effect": "Allow",
            "Action": [
              "greengrass:*"
            ],
            "Resource": [
              "*"
            ]
          }
        ]
      }
    })

    new iot.CfnPolicyPrincipalAttachment(this, 'attach', {
      policyName: policy.policyName!,
      principal: certificateArn.valueAsString,
    }).addDependsOn(policy)


    new iot.CfnThingPrincipalAttachment(this, 'principal', {
      thingName: thing.thingName!,
      principal: certificateArn.valueAsString
    }).addDependsOn(thing)

    let v = new Map([
      ["THING_NAME", thing.thingName]
    ])

    let gg_function = new gg.Function(this, 'gg_function', {
      function: gg_lambda,
      alias: alias,
      pinned: true,
      memorySize: cdk.Size.mebibytes(128),
      timeout: cdk.Duration.minutes(5),
      variables: new Map([
        ["THING_NAME", thing.thingName]
      ])
    })


    let subscriptions = new Subscriptions(this, 'subscriptions')
      .add(gg_function, `$aws/things/${thing.thingName}/#`, new AWSIoTCloud())
      .add(new AWSIoTCloud(), `$aws/things/${thing.thingName}/jobs/#`, gg_function)
     

    let core = new gg.Core(this, 'my_core', {
      thing: thing,
      certificateArn: certificateArn.valueAsString,
      syncShadow: true
    })

    new gg.Group(this, 'group', {
      core: core,
      functions: [gg_function],
      // Enable persistent sessions to get QoS1 subscriptions. 
      // GG is already publishing all messages with QoS1
      cloudSpooler: {
        enablePersistentSessions: true
      },
      loggers: [
        new LocalUserLambdaLogger(this, 'logger_1', {
          level: Logger.LogLevel.DEBUG,
          space: Size.mebibytes(32)
        }),
        new LocalGreengrassLogger(this, 'logger_2', {
          level: Logger.LogLevel.DEBUG,
          space: Size.mebibytes(32)
        })
      ],
      subscriptions: subscriptions
    })
  }
}

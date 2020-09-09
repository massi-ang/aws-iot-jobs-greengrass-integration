/* 
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: MIT-0
 */


import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { GgStackStack } from '../lib/gg-stack-stack';

const app = new cdk.App();
new GgStackStack(app, 'GgStackStack');

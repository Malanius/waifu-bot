import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export interface GitHubDeployProps extends cdk.StackProps {
  repository: string;
  branch?: string;
}

export class GitHubDeploy extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GitHubDeployProps) {
    super(scope, id, props);

    const { repository, branch } = props;
    const account = cdk.Stack.of(this).account;
    const branchPath = branch ? `ref:refs/heads/${branch}` : '*';

    const githubProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GitHubProvider',
      `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`
    );

    const deployRole = new iam.Role(this, 'CdkDeployRole', {
      assumedBy: new iam.FederatedPrincipal(
        githubProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${repository}:${branchPath}`,
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),

      inlinePolicies: {
        allowCdkAssume: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['sts:AssumeRole', 'sts:TagSession'],
              resources: ['arn:aws:iam::*:role/cdk-*'],
            }),
          ],
        }),
      },
    });

    deployRole.attachInlinePolicy(
      new iam.Policy(this, 'CloudformationPolicy', {
        policyName: 'deploy-cloudformation',
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['cloudformation:*'],
            resources: ['*'],
          }),
        ],
      })
    );

    deployRole.attachInlinePolicy(
      new iam.Policy(this, 'CdkPolicy', {
        policyName: 'deploy-cdk',
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['sts:AssumeRole', 'sts:TagSession', 'iam:*'],
            resources: [`arn:aws:iam::${account}:role/cdk-*`],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ecr:*'],
            resources: [`arn:aws:ecr:*:${account}:repository/cdk-*`],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:*'],
            resources: ['arn:aws:s3:::cdk-*'],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ssm:*'],
            resources: [`arn:aws:ssm:*:${account}:parameter/cdk-*`],
          }),
        ],
      })
    );
    new cdk.CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
  }
}

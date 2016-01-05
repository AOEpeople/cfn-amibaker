/**
 * A Lambda function that takes an AWS CloudFormation stack name and instance id
 * and returns the AMI ID.
 *
 * @see https://blogs.aws.amazon.com/application-management/post/Tx38Z5CAM5WWRXW/Faster-Auto-Scaling-in-AWS-CloudFormation-Stacks-with-Lambda-backed-Custom-Resou
 */

var r = require('cfn-response');

exports.handler = function (event, context) {

    // console.log("REQUEST RECEIVED:\n", JSON.stringify(event));
    var p = event.ResourceProperties,
        stackName = p.StackName,
        instanceId = p.InstanceId,
        region = p.Region,
        amiName = p.AmiName || stackName + '-' + instanceId,
        tags = p.Tags || [],
        AWS = require("aws-sdk"),
        ec2 = new AWS.EC2({region: region}),
        res = {},
        tagPrefix = 'cfn:';

    if (event.RequestType == "Delete") {
        // console.log("REQUEST TYPE:", "delete");
        if (stackName && region) {
            var params = {
                Filters: [{
                    Name: 'tag:'+tagPrefix+'stack-name',
                    Values: [ stackName ]
                },{
                    Name: 'tag:'+tagPrefix+'stack-id',
                    Values: [ event.StackId ]
                },{
                    Name: 'tag:'+tagPrefix+'logical-id',
                    Values: [ event.LogicalResourceId ]
                }]
            };
            ec2.describeImages(params, function (err, data) {
                if (err) {
                    res = {Error: "DescribeImages call failed"};
                    // console.log(res.Error + ":\n", err);
                    r.send(event, context, r.FAILED, res);
                } else if (data.Images.length === 0) {
                    r.send(event, context, r.SUCCESS, {Info: "Nothing to delete"});
                } else {
                    var imageId = data.Images[0].ImageId;
                    // console.log("DELETING:", data.Images[0]);
                    ec2.deregisterImage({ImageId: imageId}, function (err, data) {
                        if (err) {
                            res = {Error: "deregisterImage failed"};
                            // console.log(res.Error + ":\n", err);
                            r.send(event, context, r.FAILED);
                        } else {
                            res.ImageId = imageId;
                            r.send(event, context, r.SUCCESS);
                        }
                    });
                }
            });
        } else {
            res = {Error: "StackName or InstanceRegion not specified"};
            // console.log(res.Error);
            r.send(event, context, r.FAILED, res);
        }
        return;
    }

    // console.log("REQUEST TYPE:", "create");
    if (stackName && instanceId && region) {
        ec2.createImage(
            {
                InstanceId: instanceId,
                Name: amiName,
                NoReboot: true
            }, function (err, data) {
                if (err) {
                    res = {Error: "createImage failed"};
                    // console.log(res.Error + ":\n", err);
                    r.send(event, context, r.FAILED, res);
                } else {
                    var imageId = data.ImageId;
                    // console.log('SUCCESS: ', "ImageId - " + imageId);

                    var params = {
                        Resources: [imageId],
                        Tags: [{
                            Key: ''+tagPrefix+'stack-name',
                            Value: stackName
                        }, {
                            Key: ''+tagPrefix+'stack-id',
                            Value: event.StackId
                        }, {
                            Key: ''+tagPrefix+'logical-id',
                            Value: event.LogicalResourceId
                        }]
                    };
                    params.Tags.concat(tags);
                    ec2.createTags(params, function (err, data) {
                        if (err) {
                            res = {Error: "createTags failed"};
                            // console.log(res.Error + ":\n", err);
                            r.send(event, context, r.FAILED, res);
                        } else {
                            res.ImageId = imageId;
                            r.send(event, context, r.SUCCESS, res);
                        }
                    });
                }
            }
        );
    } else {
        res = {Error: "StackName, InstanceId or InstanceRegion not specified"};
        // console.log(res.Error);
        r.send(event, context, r.FAILED, res);
    }
};
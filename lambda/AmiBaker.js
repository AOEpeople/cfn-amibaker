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
        stackName = p.StackName || errorExit('StackName missing'),
        instanceId = p.InstanceId || errorExit('InstanceId missing'),
        region = p.Region || errorExit('Region missing'),
        amiName = p.AmiName || stackName + '-' + instanceId,
        tags = p.Tags || [],
        AWS = require("aws-sdk"),
        ec2 = new AWS.EC2({region: region}),
        res = {},
        tagPrefix = 'cfn:';

    if (event.RequestType == "Delete") {
        var params = {
            Filters: [
                {Name: 'tag:' + tagPrefix + 'stack-name', Values: [stackName]},
                {Name: 'tag:' + tagPrefix + 'stack-id', Values: [event.StackId]},
                {Name: 'tag:' + tagPrefix + 'logical-id', Values: [event.LogicalResourceId]}
            ]
        };
        ec2.describeImages(params, function (err, data) {
            if (err) {
                errorExit("describeImages failed " + err, event, context);
            } else if (data.Images.length === 0) {
                r.send(event, context, r.SUCCESS, {Info: "Nothing to delete"});
            } else {
                var imageId = data.Images[0].ImageId;
                // console.log("DELETING:", data.Images[0]);
                ec2.deregisterImage({ImageId: imageId}, function (err, data) {
                    if (err) {
                        errorExit("deregisterImage failed " + err, event, context);
                    } else {
                        res.ImageId = imageId;
                        r.send(event, context, r.SUCCESS);
                    }
                });
            }
        });
        return;
    }

    ec2.createImage(
        {
            InstanceId: instanceId,
            Name: amiName,
            NoReboot: true
        }, function (err, data) {
            if (err) {
                errorExit("createImage failed " + err, event, context);
            } else {
                var imageId = data.ImageId;
                // console.log('SUCCESS: ', "ImageId - " + imageId);

                var params = {
                    Resources: [imageId],
                    Tags: [
                        {Key: tagPrefix + 'stack-name', Value: stackName},
                        {Key: tagPrefix + 'stack-id', Value: event.StackId},
                        {Key: tagPrefix + 'logical-id', Value: event.LogicalResourceId}
                    ]
                };
                params.Tags.concat(tags);
                ec2.createTags(params, function (err, data) {
                    if (err) {
                        errorExit("createTags failed " + err, event, context);
                    } else {
                        res.ImageId = imageId;
                        r.send(event, context, r.SUCCESS, res);
                    }
                });
            }
        }
    );
};

var errorExit = function (message, event, context) {
    res = {Error: message};
    // console.log(res.Error);
    r.send(event, context, r.FAILED, res);
};
/**
 * A Lambda function that takes an AWS CloudFormation stack name and instance id
 * and returns the AMI ID.
 *
 * @see https://blogs.aws.amazon.com/application-management/post/Tx38Z5CAM5WWRXW/Faster-Auto-Scaling-in-AWS-CloudFormation-Stacks-with-Lambda-backed-Custom-Resou
 */

var r = require('cfn-response');

exports.handler = function (e, ctx) {

    console.log("REQUEST RECEIVED:\n", JSON.stringify(e));

    if (e.RequestType == "Delete" && !e.ResourceProperties.InstanceId) {
        r.send(e, ctx, r.SUCCESS, {Info: "Nothing to delete"});
    }

    var p = e.ResourceProperties,
        stackName = p.StackName || errorExit('StackName missing'),
        instanceId = p.InstanceId || errorExit('InstanceId missing'),
        region = p.Region || errorExit('Region missing'),
        amiName = p.AmiName || stackName + '-' + instanceId,
        tags = p.Tags || [],
        AWS = require("aws-sdk"),
        ec2 = new AWS.EC2({region: region}),
        res = {},
        tagPrefix = 'cfn:';

    if (e.RequestType == "Delete") {
        var params = {
            Filters: [
                {Name: 'tag:' + tagPrefix + 'stack-name', Values: [stackName]},
                {Name: 'tag:' + tagPrefix + 'stack-id', Values: [e.StackId]},
                {Name: 'tag:' + tagPrefix + 'logical-id', Values: [e.LogicalResourceId]}
            ]
        };
        ec2.describeImages(params, function (err, data) {
            if (err) {
                errorExit("describeImages failed " + err, e, ctx);
            } else if (data.Images.length === 0) {
                r.send(e, ctx, r.SUCCESS, {Info: "Nothing to delete"});
            } else {
                var imageId = data.Images[0].ImageId;
                // console.log("DELETING:", data.Images[0]);
                ec2.deregisterImage({ImageId: imageId}, function (err, data) {
                    if (err) {
                        errorExit("deregisterImage failed " + err, e, ctx);
                    } else {
                        res.ImageId = imageId;
                        r.send(e, ctx, r.SUCCESS);
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
                errorExit("createImage failed " + err, e, ctx);
            } else {
                var imageId = data.ImageId;
                // console.log('SUCCESS: ', "ImageId - " + imageId);

                var params = {
                    Resources: [imageId],
                    Tags: tags.concat([
                        {Key: tagPrefix + 'stack-name', Value: stackName},
                        {Key: tagPrefix + 'stack-id', Value: e.StackId},
                        {Key: tagPrefix + 'logical-id', Value: e.LogicalResourceId}
                    ])
                };
                ec2.createTags(params, function (err, data) {
                    if (err) {
                        errorExit("createTags failed " + err, e, ctx);
                    } else {
                        res.ImageId = imageId;
                        r.send(e, ctx, r.SUCCESS, res);
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
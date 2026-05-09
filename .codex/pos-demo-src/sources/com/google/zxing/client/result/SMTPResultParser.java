package com.google.zxing.client.result;

import com.google.zxing.Result;

/* JADX INFO: loaded from: classes.dex */
public final class SMTPResultParser extends ResultParser {
    @Override // com.google.zxing.client.result.ResultParser
    public EmailAddressParsedResult parse(Result result) {
        String rawText = getMassagedText(result);
        if (!rawText.startsWith("smtp:") && !rawText.startsWith("SMTP:")) {
            return null;
        }
        String emailAddress = rawText.substring(5);
        String subject = null;
        String body = null;
        int iIndexOf = emailAddress.indexOf(58);
        int colon = iIndexOf;
        if (iIndexOf >= 0) {
            subject = emailAddress.substring(colon + 1);
            emailAddress = emailAddress.substring(0, colon);
            int iIndexOf2 = subject.indexOf(58);
            colon = iIndexOf2;
            if (iIndexOf2 >= 0) {
                body = subject.substring(colon + 1);
                subject = subject.substring(0, colon);
            }
        }
        return new EmailAddressParsedResult(new String[]{emailAddress}, null, null, subject, body);
    }
}

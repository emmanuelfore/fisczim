[Sep 21 10h07:04.106] - Error event 20155 
A PIN Translation failure occurred for terminal TEST0001 because 
Postilion exception: [postilion.realtime.sdk.crypto.XPinLengthError]
Description: A cryptographic operation (<unknown>) involving key 'KEYSET_FFFFFF_BDK' failed, because invalid data was supplied. The invalid data was in field 'PIN'. The data was invalid because PIN length is invalid.
ID: [126]
Data: [none]
	at postilion.realtime.sdk.crypto.impl.rg7000.ARG7000KeyImpl.processErrorCode(ARG7000KeyImpl.java:166)
	at postilion.realtime.sdk.crypto.impl.rg7000.RG7000DesKeyImpl.processErrorCode(RG7000DesKeyImpl.java:1825)
	at postilion.realtime.sdk.crypto.impl.rg7000.RG7000DesKeyImpl.processErrorCode(RG7000DesKeyImpl.java:1771)
	at postilion.realtime.termappframework.crypto.impl.rg7000.TaFwRG7000TripleDesCustomBdkImpl.processResponseAndErrorCode(TaFwRG7000TripleDesCustomBdkImpl.java:452)
	at postilion.realtime.termappframework.crypto.impl.rg7000.TaFwRG7000TripleDesCustomBdkImpl.translateDukptPinWithDerivedIpek(TaFwRG7000TripleDesCustomBdkImpl.java:139)
	at postilion.realtime.termappframework.crypto.impl.rg7000.ATaFwDesRG7000Bdk.translateDukptPinWithDerivedIpek(ATaFwDesRG7000Bdk.java:335)
	at postilion.realtime.termappframework.crypto.impl.rg7000.TaFwDesRG7000Bdk.translateDukptPinWithDerivedIpek(TaFwDesRG7000Bdk.java:230)
	at postilion.realtime.termappframework.ATermAppPosEntity.translatePin(ATermAppPosEntity.java:2966)
	at postilion.realtime.termappframework.ATermAppPosEntity.translatePin(ATermAppPosEntity.java:2840)
	at postilion.realtime.termappiso.TermAppIso.getTranslatedPin(TermAppIso.java:1617)
	at postilion.realtime.termappiso.TermAppIso.constructPinBlockForTranMgr(TermAppIso.java:1688)
	at postilion.realtime.termappiso.TermAppIso.processAuthOrTranReqFromRemote(TermAppIso.java:1853)
	at postilion.realtime.termappiso.TermAppIso.processTranRequestFromRemote(TermAppIso.java:918)
	at postilion.realtime.termappframework.ATermAppPosEntity.processMsg(ATermAppPosEntity.java:765)
	at postilion.realtime.termappiso.TermAppIso.processMsg(TermAppIso.java:400)
	at postilion.realtime.sdk.node.ProfilingPosEntity.processMsg(ProfilingPosEntity.java:327)
	at postilion.realtime.sdk.node.PosEntityProcessor.processDataEventFromPosEntity(PosEntityProcessor.java:3164)
	at postilion.realtime.sdk.node.PosEntityProcessor.processEndpointData(PosEntityProcessor.java:4040)
	at postilion.realtime.sdk.node.PosEntityProcessor.processEvent(PosEntityProcessor.java:1359)
	at postilion.realtime.sdk.util.Processor.run(Processor.java:213)
	at postilion.realtime.sdk.env.AppProcessor.run(AppProcessor.java:135)
. The key used in translation was KEYSET_FFFFFF_BDK.
stack trace 
Postilion exception: [postilion.realtime.sdk.crypto.XPinLengthError]
Description: A cryptographic operation (<unknown>) involving key 'KEYSET_FFFFFF_BDK' failed, because invalid data was supplied. The invalid data was in field 'PIN'. The data was invalid because PIN length is invalid.
ID: [126]
Data: [none]
	at postilion.realtime.sdk.crypto.impl.rg7000.ARG7000KeyImpl.processErrorCode(ARG7000KeyImpl.java:166)
	at postilion.realtime.sdk.crypto.impl.rg7000.RG7000DesKeyImpl.processErrorCode(RG7000DesKeyImpl.java:1825)
	at postilion.realtime.sdk.crypto.impl.rg7000.RG7000DesKeyImpl.processErrorCode(RG7000DesKeyImpl.java:1771)
	at postilion.realtime.termappframework.crypto.impl.rg7000.TaFwRG7000TripleDesCustomBdkImpl.processResponseAndErrorCode(TaFwRG7000TripleDesCustomBdkImpl.java:452)
	at postilion.realtime.termappframework.crypto.impl.rg7000.TaFwRG7000TripleDesCustomBdkImpl.translateDukptPinWithDerivedIpek(TaFwRG7000TripleDesCustomBdkImpl.java:139)
	at postilion.realtime.termappframework.crypto.impl.rg7000.ATaFwDesRG7000Bdk.translateDukptPinWithDerivedIpek(ATaFwDesRG7000Bdk.java:335)
	at postilion.realtime.termappframework.crypto.impl.rg7000.TaFwDesRG7000Bdk.translateDukptPinWithDerivedIpek(TaFwDesRG7000Bdk.java:230)
	at postilion.realtime.termappframework.ATermAppPosEntity.translatePin(ATermAppPosEntity.java:2966)
	at postilion.realtime.termappframework.ATermAppPosEntity.translatePin(ATermAppPosEntity.java:2840)
	at postilion.realtime.termappiso.TermAppIso.getTranslatedPin(TermAppIso.java:1617)
	at postilion.realtime.termappiso.TermAppIso.constructPinBlockForTranMgr(TermAppIso.java:1688)
	at postilion.realtime.termappiso.TermAppIso.processAuthOrTranReqFromRemote(TermAppIso.java:1853)
	at postilion.realtime.termappiso.TermAppIso.processTranRequestFromRemote(TermAppIso.java:918)
	at postilion.realtime.termappframework.ATermAppPosEntity.processMsg(ATermAppPosEntity.java:765)
	at postilion.realtime.termappiso.TermAppIso.processMsg(TermAppIso.java:400)
	at postilion.realtime.sdk.node.ProfilingPosEntity.processMsg(ProfilingPosEntity.java:327)
	at postilion.realtime.sdk.node.PosEntityProcessor.processDataEventFromPosEntity(PosEntityProcessor.java:3164)
	at postilion.realtime.sdk.node.PosEntityProcessor.processEndpointData(PosEntityProcessor.java:4040)
	at postilion.realtime.sdk.node.PosEntityProcessor.processEvent(PosEntityProcessor.java:1359)
	at postilion.realtime.sdk.util.Processor.run(Processor.java:213)
	at postilion.realtime.sdk.env.AppProcessor.run(AppProcessor.java:135)
[Error event 20155] 
 
this was before I had found that tool and made my Algorithm right 
I hadn't received any trace messages since then 
[1632247411] Emmanuel Fore: this was before I had found that tool and made my Algorithm right
<<< That’s great , you managed to figure it out  
Im thinking that if we can use your postillion with my encryption we can see where its going wrong.  
Because I am still geting error code 126 after getting the encryption right 
I suppose there are no errors or events now on the app? 
[1632247712] Emmanuel Fore: Im thinking that if we can use your postillion with my encryption we can see where its going wrong. 
<<< Sure send your code and will try it out  
[1632247767] Perrence Muzavazi: I suppose there are no errors or events now on the app?
<<< There are there,,But the team is not responding in time to send them, Plus they dnt really understand the errors,, 
[1632247799] Perrence Muzavazi: Sure send your code and will try it out 
<<< okay, great. 
To view this file, go to: https://login.skype.com/login/sso?go=webclient.xmm&docid=0-neu-d7-b90cdd3517d59969dd623b11a5b967c1 
To view this file, go to: https://login.skype.com/login/sso?go=webclient.xmm&docid=0-neu-d7-c17df1ea62f9e7e86e042976b1cfc005 
Im using Dukpt.NET library 
Thanks, checking them out  
Will update you 
Description: A cryptographic operation (translate DUKPT PIN with derived IPEK) involving key 'KEYSET_FFFFFF_BDK' failed, because invalid data was supplied. The invalid data was in field 'PIN block'. The data was invalid because PIN block invalid according to format NONE. 
This is the event log that is coming from termapp 
Morning Emmanuel, thanks for the update 
will be trying out your code in a bit, postilion was down on my end 
good morning Perrence.  We are now switching to Master/Session key exchange.  
To view this shared photo, go to: https://login.skype.com/login/sso?go=xmmfallback?pic=0-neu-d14-4731d473af0e25b1da65c7f7c195b14d 
So this is how the document specifies it..Not detail is given 
Good morning Emmanuel, how is it going? 
I understand that we exchange a session key through a network management call, and then use that key to decrypt the PIN. I am not sure of what encryption method is used. Can you please enlighten me on that 
the key exchange will be the same as sign on request with function code 811 
its not really decryption, you will either be encrypting or translating 
[1632385098] Perrence Muzavazi: the key exchange will be the same as sign on request with function code 811
<<< Okay, yes.. I think I got the call right. 
9/23/2021 10:25 AM Call started

 Okay, so that HexString  variable is actually similar to the one I get using OpenIso8085NET, But the conversion to byte array is the one which is differing 
Hi Emmanuel, please check this zip file 
managed to test the code on my side and its working fine 
Hie Perrence. Let me check it out 
To view this file, go to: https://login.skype.com/login/sso?go=webclient.xmm&docid=0-weu-d18-abda50fc4de791f4b814831492d84d8a 
To view this file, go to: https://login.skype.com/login/sso?go=webclient.xmm&docid=0-weu-d5-e15b95d1c67ff6d7704fe0b65b0f71fa 
how is it going Emmanuel  
I have added the dependencies to my project.. I am getting some errors on my graddle. 
Could not find method implimentation() for arguments [org.bitbucket.openisoj:openisoj-core:1.1.4] on object of type org.gradle.api.internal.artifacts.dsl.dependencies.DefaultDependencyHandler. 
cool, let me know how it goes 
Do you have a jar file for the library instead? 
yeah sure 
one moment 
Okay, better then. 
https://repo1.maven.org/maven2/org/bitbucket/openisoj/openisoj-core/1.1.4/openisoj-core-1.1.4.jar 
cool,, Its now imoorted 
imported 
cool 
are you winning over there Emmanuel? 
Yes,, I won Mr Perrence. I did send a successful transaction 
that's really great 
hope the other bits are working well 
Okay, sure thanks 
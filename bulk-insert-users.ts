import "dotenv/config";
import { pool } from "./server/db.js";

const raw = `709a04bf-c426-454d-bc97-4ad90e62f263,manuchidovi@gmail.com,$2a$10$PDDrZ4QwmbiWqLMP8LRKp.dgwfxioF/4v.Yhk5c1.eHuGA5I234he,johnso doe,manuchidovi,true,2026-01-23 21:23:20.336955+00
7b94f22c-1177-4d97-9776-e4d2e8359db7,brianmubaiguru@gmail.com,$2a$10$6ud7z5ZmtCnj2WO3hRTim..AyFAt5cK.8AdGrVxFq.4PfF0aPXZQa,Brian Wallace,brianmubaiguru,true,2026-01-18 14:42:40.218973+00
464874ee-a3d9-4cf6-af22-44a257231ba7,rabyoninvestmants23@gmail.com,$2a$10$Y8P0hvHx2/x2Y4sjSpg5VuAv8e/W5seZhvwUZULaVAQNyPBE/.LGO,Cashier 1,rabyoninvestmants23,true,2026-07-18 13:51:16.774801+00
049e7ec7-a8f8-4858-9500-91948cc64070,jmunyemba@gmail.com,$2a$10$M8C1kTeIlxSNyiUkQwS6Q.5RJJ8NLHXnzX27JwvnzjM89AG2/WADO,John Munyemba,jmunyemba,true,2026-02-07 18:21:33.756831+00
f1f678a1-d654-4a79-9470-3109781da4a1,emmanuelfore22@gmail.com,$2a$10$FHT8n7vszeVYPc4PGqddvuOaNCa2j/SP9ChRPVN1BuAUbTHS7Hp1u,Emmanuel Fore,emmanuelfore22,true,2026-01-16 14:07:06.734406+00
526b1b42-da98-4a5f-8d55-c82a82f34ff8,thabiso@molai.africa,$2a$10$MJtq8CBaEa4qDpyF88uTzux.92.y1Yd0YPfHNQLHuAjpgBVXDPGqi,Harrison,thabiso,true,2026-08-07 09:13:09.606407+00
831d50f9-bbf5-4c92-8df6-1aaf43ed6044,chidovikireni@gmail.com,$2a$10$yTulkSzw39caQllF4wcI5eMAaDHBIMJz6LkJ/mfWEhm7iU0ly0gE.,Emmanuel FOre,chidovikireni,true,2026-02-06 13:59:22.402031+00
bcbed00c-f2e5-43ae-853b-0599593c92f7,kingsonkwari@gmail.com,$2a$10$FxlrwRZqqnrf2DEvT6uQquHY05rAzmXBmM.ZoKGiqqEeFZ6cD1OBa,Kingson KWari,kingsonkwari,true,2026-02-05 18:27:18.371661+00
5c617866-605c-4ef5-8bb1-a7d1c1625d58,s82p84@gmail.com,$2a$10$Jgr5nd.JFl5JmMZrWTgpYev7s7v3MEYYBf5903H2EfrAM0lKh8D3G,simba,s82p84,true,2026-02-07 19:27:46.846883+00
501c46a9-2023-496d-8307-d1480a029b0f,demo@zimra.com,$2a$10$zZ6hxJT14c1kcrMUCMDyW./t8PLfJgT83Nex2ahpD.pWI/zUO210S,Demo User,demo,true,2026-01-16 14:19:10.090172+00
9699e9d3-5777-45ef-888c-7bcf957480d2,foreemmanuel@gmail.com,$2a$10$vQXBYAQ50jFQVU5ohEUQIecWr9SG/JW.8lSIC4XrSp8O4lgvFbWBm,Emmanuel Fore,foreemmanuel,true,2026-02-06 04:11:28.786488+00
9482b181-9109-4012-8d65-291488268746,manuchidovi3@gmail.com,$2a$10$YYcMvxizfcXY1sFNrdmC6OKzaaw/XGuH8IUAIpYa1uA043yDIWBTK,admin@zimra.co.zw,manuchidovi3,true,2026-02-09 08:10:07.500232+00
f8914d8f-fd64-483f-8e14-0d46359451d5,manuchidovi7@gmail.com,$2a$10$J9pK.ftrN/sYEDEYEQt9f.8x9UfMLk33Xrvh8Uie5Ik29tGiutVyi,Emmanuel Chidovi,manuchidovi7,true,2026-02-09 17:40:08.373315+00
066c274e-17a8-4bdd-ad35-8c195ddb91a7,ennie@rabyon.com,$2a$10$ncLOZDgCtgiOW4epk31UJO3MFCcQxcVD/SuIFyWCSaJXef8HB/cmC,ENNIE,ennie,true,2026-07-20 16:56:22.749585+00
ed700472-4587-44e7-bed3-efe24038bd34,aasali1984@gmail.com,$2a$10$0P4Um5i5nfitFNElZ4k/EurndBaaiHpq.0.pNBQ0jtZyaE/wWu3L6,Asali,aasali1984,true,2026-08-18 06:48:05.815501+00
b9708480-a766-4ed4-8557-72d0a04f2d44,abc@gmail.com,$2a$10$KymDYrACvtCbY0FspV2uX.jWPZ8MpXJkMdOnNGnDX0p5cbWHHdd8W,testt,abc,true,2026-02-09 08:49:47.468373+00
fd70e344-f450-474a-9e5d-1dfb94aa7ea8,manuchidovi6@gmail.com,$2a$10$letRzyMNA8P00fCguWtH5OsTquwOBuXK/YNSd7Nl/aoq6sXRtE3XO,Manu Chidovi,manuchidovi6,true,2026-02-09 08:11:51.296005+00
ae4d9e4d-e109-47e0-81ed-9130bf407df0,batiraishemunongerwa@gmail.com,$2a$10$P7IG.WMSSr3GefukjSU.i.IgCncjyKRydVEx.5Hcj0xrIAsdfT5cq,Batiraishe Munongerwa,batiraishemunongerwa,true,2026-02-09 13:53:48.9986+00
ac829906-7700-401a-a298-a53f2adb4237,johndoe@gmail.com,$2a$10$iIgwnDfa9yxpJbAC0z7IX.TUdAMaXhJG7qHVbuaI05M00RdPTn652,John Doe,johndoe,true,2026-02-16 06:09:34.849145+00
7c6c1810-adb8-49b8-9414-dfb6c432b72d,eman@gmail.com,$2a$10$Rr3EIvyclP1tQQzo6qvNYe94HKnozpyfQPzWrsCVrnPw5JB6hvlFW,eman doe,eman,true,2026-02-15 21:52:13.82843+00
49601b15-077b-4e74-b500-7e07b2deb47e,kevivemgt@gmail.com,$2a$10$IqxM.XfwOntnWilLqsTdQetjF46bgZZ87NQwWNiTHWmvYBPVljX56,Keith Moyo,kevivemgt,true,2026-02-12 13:03:28.172672+00
8de27280-db5a-4a14-bbf2-81adbd3f84df,doe@gmail.com,$2a$10$/Q7BtoNimSYDBzlN.mbJjO8EFVpL.44jmWxv/MhUrwn3WN6aPV77K,John Doe,doe,true,2026-02-16 06:10:49.07643+00
2b210a05-1958-47ef-9edb-811aab089648,mqanuchidovi3@gmail.com,$2a$10$wmOcZ0tWJ6ciC7bM9q0WL.TNFZWBRjBaWtq513AJnOilR.FYWCB0u,Manu Chidovi,mqanuchidovi3,true,2026-02-09 08:43:08.689029+00
bea1a68f-9e7c-4738-bf9a-9acb428cf05b,jdoe@gmail.com,$2a$10$5.8c9GwfwyoUALC73ElPGORYJELbW0Ixjpbn6CgjN6CsNQpTgLsZG,John Doe,jdoe,true,2026-02-16 06:10:29.913693+00
843ebcf2-3dfe-43e1-aeb1-bc59eb922383,georgeshambira@gmail.com,$2a$10$jI7QMPMObuwj3cXTBhQKduTWShGhBa6bHU/jOvTHmXmPumjB5pMh6,George Shambira,georgeshambira,true,2026-02-08 14:34:38.258844+00
f24a2267-d06d-4203-b7d9-6f9d0af1c032,decorouskitchens@gmail.com,$2a$10$0EZmwqpPtgYuVIFGymXNwebMsUkgM9zDMMu18bNgtRLNQE3BIIxF.,decorous kitchens & fittings,decorouskitchens,true,2026-05-22 05:15:48.083167+00
34380e67-df49-43c7-bd4d-0687f4806e3d,lucibuoy@gmail.com,$2a$10$JCTqe7tpEF2yq8TscWLlaeAbWztcz.cbAtS6EKUzxiqxUKmdKksSS,Lucius,lucibuoy,true,2026-02-10 06:58:03.478411+00
28bc3dca-cf74-4eb5-b066-e7b1ed198d14,cia@gmail.com,$2a$10$AFM9h.ieoBastg6YL/X/duJIzD1nZugOiLiqDOBeqVB6p3X/DLbdC,demo,cia,true,2026-06-05 21:01:53.574486+00
6394ca7f-44ad-4009-b154-ced3c0027c5f,chigamaben@gmail.com,$2a$10$gsGaWxBBXe5g0CkncBnWJ.J/7koLCuIZp.jRPJtuh.hlbTsTsZZrC,Reuben Chigama,chigamaben,true,2026-03-05 13:33:47.208163+00
d638dcc8-5956-496c-9b11-7bf721746acf,bhalandlovu@gmail.com,$2a$10$/dVjT5peTxEHqZptCFHDeeJhp7i4ZQfV8w6GFj1cS7UN.f27dSFfK,Thamsanqa Bhala,bhalandlovu,true,2026-02-18 19:27:48.477972+00
74787fcc-fe4d-49f8-b32f-877971d99079,masimike.school@gmail.com,$2a$10$XQCZk9SjLaLnPCFrrznNjuTcC1w/iEL1Sf2lrFaskUDm3BYaAx/8W,Thelma Matambirofa,masimike.school,true,2026-02-18 16:09:29.734582+00
c7293d42-fcb7-4e27-bde1-e45b3fe4837e,hillend205@gmail.com,$2a$10$gC5tI/thRXJZA8tnSdjdmeHacaITV6SQ/Zo1fmSd.JRK5XpDalQNu,Dadirai,hillend205,true,2026-02-09 07:54:42.838098+00
7bf7a6bd-3b99-41c6-a417-4642a0fccab0,adroitconnecthub@gmail.com,$2a$10$FzZLs3CCfIDsp85VJ9sDPODViUpZdxoY3qRhN3fDP7y//A6KVnZgC,Phillip B,adroitconnecthub,true,2026-02-19 05:07:55.985795+00
756e8ca0-8a1e-4487-8e96-51397cce8793,detromelardhliwe@gmail.com,$2a$10$4PhDiZ2EQLx2nT1VLrlqRewUyCli5BvTPdF5RokT1tfBy22pKZJju,Saungweme,detromelardhliwe,true,2026-02-17 13:04:25.208052+00
956a41ca-4a9b-4015-ac76-2272c670768f,eman2@gmail.com,$2a$10$eIbWb8S8uHHqJHEFmc1CCu9BgYoEiDmacILZjfgnpzvkP8U0yFO6K,Emman Fore,eman2,true,2026-03-16 15:20:33.872164+00
5afe99b7-392a-4b49-9c90-5a5f3e357300,mm@gmail.com,$2a$10$HIlUpw0HMPVE1yIIsqtjK.f1mXIzf0.HB0DTyKGKTXXIZTBCFOJjG,MARKETING test,mm,true,2026-06-11 09:09:09.629133+00
646bbbcb-a7cb-46d9-b724-62c0418f4be4,prakashsamjiandsons@gmail.com,$2a$10$5IMrLRSr.tP7rjyEj3k1EO.cHnAnLgP0xBFKiU68NBoHYUJXBXF2S,prakash samji,prakashsamjiandsons,true,2026-02-24 16:02:25.302616+00
fcbcde0a-60d6-4066-a495-e1ba4c641e07,taczimcc@gmail.com,$2a$10$hOifI3F385/5iY3i4cYuHea0FdxhL5juULfdy73xe1msgZ4Vn0746,TCZ,taczimcc,true,2026-02-20 19:39:30.454909+00
5c28fc05-615f-4122-9278-f1d736a63408,kudzicloud@gmail.com,$2a$10$h0WCAGp2yvQS9t5xRpHBJOdel8KKPT9YTOQ71jgLJS.w2sl9bBV9G,Kudzaishe Zharare,kudzicloud,true,2026-02-18 13:04:25.706426+00
443041ac-d84d-479b-8938-4d5ee013db88,gwinyaiv@gmail.com,$2a$10$6uCYdZGntSV7XhsJmC8zzObSPyGJoe6eFyOLtt0X7QI.ivZMAGneO,Gwinyai Vincent Mandipira,gwinyaiv,true,2026-02-18 18:14:19.070146+00
88a8f82a-1e02-49ef-b1d0-80b62e44fe0f,detromelarddhliwayo@gmail.com,$2a$10$fbosKpMY/S5nryWdhTFRoeByLmQxgAvvftLriXMU3/uASOQdytMD.,Detro,detromelarddhliwayo,true,2026-03-10 09:24:23.550167+00
c2e03c93-d686-41af-9f51-63d87e931453,emman@gmail.com,$2a$10$hVNHdEL4aPfg7E.l345bP.Rx/sgUHdh63fXfy7rbIR7kD3C9lKOk.,Enmanu,emman,true,2026-03-16 15:16:33.051083+00
01e9f2f2-65d9-47f4-9619-ecb73826363d,rabyoninvestmants@gmail.com,$2a$10$H6ceDSTmq1XXess81pe8..XqWSStTtZFAu6Wl17Uh9jfw2w8kniUO,Tapiwa,rabyoninvestmants,true,2026-07-18 13:54:40.922085+00
bfa20a44-62c5-4260-b944-58d4d340f5cb,alexjanhi@gmail.com,$2a$10$NvsxIGTK15TKgTf3j2o3Qe23fMSDlabBx2d7kODF1YruphzasRGKm,Alexio janhi,alexjanhi,true,2026-06-22 10:57:09.261458+00
b73e74bc-a7a3-41c7-98b3-0aeaf628e5d1,prakashsamjiandson@gmail.com,$2a$10$ByyaiC/NOoE0RWNauaz0t.63v856SfHJs9xnWYDprA5NPf8b6jpa6,Samji,prakashsamjiandson,true,2026-03-17 07:48:06.390844+00
24f06fd2-b45c-4a62-af0e-bfdec1c8e5d4,test@example.com,$2a$10$RpFPDWmp3BDEym53tc99KOYQqG0S.skanA14Ciz1M7XZswApelAUa,Test User,test,true,2026-03-25 02:16:28.143784+00
346a1600-c7a5-4920-920a-927aba1e6443,phillip.d@gtservices.co.zw,$2a$10$aTyr0yTxheHNtjCRqaxO.uVTXthMWt31d7Eg2ZCAhWD9H/03eBis6,Philip D,phillip.d,true,2026-05-25 06:40:16.735927+00
5038bafb-fd94-4925-aba2-607df7201b86,jollyrest@gmail.com,$2a$10$tQdaSrekHpsyB4C//5ZNWeyrubK29iwlc128h3r.a5SSiMge7YQrC,JOLLY JONGWE RESTARANT,jollyrest,true,2026-03-18 14:00:52.101679+00
6e09d2cb-b3e6-4b26-aff7-8ac312270b9d,detromelardhliwayo@gmail.com,$2a$10$USJsM3P7It7abwi72BdXfO9UN9uEQvMbq8VqxpZxkGvLzIf.zB.pq,Saungweme,detromelardhliwayo,true,2026-03-02 11:13:32.044127+00
c2fb3ad3-e94f-442b-8511-e4bd32aec29d,emmanu@gmail.com,$2a$10$Sqn6SRNM4kp3S0lCrCoRE.IE5FmajRtui9zHHD6VlE/bTMfezKOIe,Emmanuere Fore,emmanu,true,2026-03-26 19:00:45.208048+00
e4d37e66-b347-4b46-ae4a-65cccaa8c987,memorydzimati@gmail.com,$2a$10$YGYuwiiiuF.88LWiMhc5BuwYI1LAMItIkTnJKOH1yl9zP0oyQeM2K,Memory Dzimati,memorydzimati,true,2026-04-11 13:10:54.264199+00
ba6317e2-22fa-43e7-930b-822f3646f585,jollyres@gmail.com,$2a$10$wsyIxDg5H9bldIKhhumBEObozHalMK5hSqiAqR3RW6Tt.dxsJHLxO,JOLLY JONGWE RESTAURANT,jollyres,true,2026-03-18 13:58:49.826693+00
0019b428-9188-4297-9de0-c5eae6cf3682,memorydzimati756@gmail.com,$2a$10$vnOKBUWZD4LNBundNb3qi.yWYXXfDzelYc338eVoCahtR16QnJipu,Memory Dzimati,memorydzimati756,true,2026-04-11 13:07:57.939792+00
cdf708bf-4167-4363-9380-709661433b82,testos@gmail.com,$2a$10$.cfhpMHz9vZ35obXVSRlBukBB6ctaq9FkIAXmgt/THn72DcATEawe,testos@gmail.com,testos,true,2026-04-11 11:46:09.33598+00
19840ba5-3374-4c3a-b590-dac767762354,brianmub42@gmail.com,$2a$10$/KipTycgANcrIe/By10fbe0GAgEvx85WINGbkCNRrRt0gEwPdrY7y,Brian,brianmub42,true,2026-06-02 17:29:02.927854+00
8947cc5d-9519-495d-bb55-0aa7c5645d9f,user5@gmail.com,$2a$10$SPRJ4JJ3YNU4eI1ExN0Cwu6YcmW4uZ.lI131KwH6EtAGslUk6NxWu,user5,user5,true,2026-04-04 23:25:20.728099+00
d15a6829-7321-4c61-b72b-1ab3fd23a65f,patiesithole@yahoo.com,$2a$10$rFbaLkmWr1YAtKDN6nmG6OCGMYTHs.AuuSYT8GDzeO94jAIJYIlHy,DEPOPI ENTERPRISES,patiesithole,true,2026-08-28 11:23:49.268285+00
d5a61118-f64e-472f-9708-8f7663ba4eca,cashier2@gmail.com,$2a$10$gbj4EZE/9fbX6KnPqoWUMu.ZsO08Fhr1moAcSWxqxZAkThkWj0pVC,Cashier 2,cashier2,true,2026-07-18 13:55:28.693835+00
91024bc1-1c24-461a-ac94-ee98d93491a0,jollyjongwe@gmail.com,$2a$10$xkgm52KSOuZg/pUn3hNsfe0v3aB6XLjwKUELO06wVMlGfLlUi49fW,JOLLY JONGWE,jollyjongwe,true,2026-03-18 12:50:09.852502+00
797c8294-30da-4210-b432-0ac6b1fe3e95,masendekenokuthula862@gmail.com,$2a$10$Zdn1W1SRk.7znWXYl4na9e3xyh7dqp0pQly8TXHfrswM4dHZJEd1a,Nokuthula Masendeke,masendekenokuthula862,true,2026-04-11 12:36:52.027785+00
da66ca88-a7fc-408b-ac88-46ed587b93a1,beautystargurl2002@gmail.com,$2a$10$F0yQ7fGqXQTxcig213U/zOzrSH8j4LEHStVvfQpIrr.KhIZCta2Xi,Beauty Muzhingiri,beautystargurl2002,true,2026-03-26 18:51:25.459185+00
66bdd230-4bb9-4e2a-8779-565d6f9cf49b,apct@gmail.com,$2a$10$iEwl8RV3R2F91cB6Rros6.9RH4s7uElSVInzqEIqVSj2qIJyoGUBy,APCT,apct,true,2026-04-29 09:05:21.666004+00
10a2673b-f269-452f-a2d4-f4fadd9304c4,goosehilltrading@gmail.com,$2a$10$aoyKgTpkW1wr3gvlsz1bs.OGRZqrzpmAXiEj22ADigM2sLBENHskm,Sys Admn,goosehilltrading,true,2026-05-05 06:54:06.653867+00
bf651ba9-a429-4e7b-9a8f-302ff89fbb2f,emma.kocabean@gmail.com,$2a$10$UQRK3h6KL1uOW17RnXe0lu16ucJsSBt0yzGr/J2bSE8XOIv7Ai5gG,EM,emma.kocabean,true,2026-06-22 14:37:25.819459+00
713f6773-e65a-4bb1-b85d-86c46dfd7791,rekoaproperties@gmail.com,$2a$10$Mqp35XgXq8fUX4a0Np0mpOEbM57dkr7KHXlEap9/E8vgRzOHAoC6y,Albertto Dube,rekoaproperties,true,2026-05-07 06:06:31.593129+00
9e218fad-60c4-4e52-a9b5-18960abe2ca6,sparesarena@gmail.com,$2a$10$jP1S4vEFf3f7nlM4qUEseuC6fOCEIYUL8nd/1HMWPvTYeZdF2Fg0K,spares arena,sparesarena,true,2026-05-20 07:32:43.645784+00
52a5fb28-79b4-49b3-a851-fa537c0b3bd7,sparesarenadmin@gmail.com,$2a$10$xPJGTwaQ/Li1kztBM6OEReo9ppbPU.fLI.CskkgsCsbq7XEBkf.vS,ALEXIO,sparesarenadmin,true,2026-05-21 09:55:06.275123+00
563f4030-7f8e-4a49-8ba3-7ad75cf017c6,zimbolables@gmail.com,$2a$10$NG.tux3arkk/r3s4MbAua.RuAMITvB25q91Gv6GSXgcp2ux9CXB6a,Patrick Papfumo,zimbolables,true,2026-07-15 09:35:53.673181+00
214fbca4-31c9-4c45-8c28-725311bf016a,test5453@gmail.com,$2a$10$I18n2m1QXkbXLoTKrfBg1.fHKPOfImnWI09YcJ2LRGbf67c6q53ti,TEST COMP,test5453,true,2026-08-30 11:57:03.267035+00
a1370c81-ca09-4331-90b1-7142eec14c40,rory@macktransport.org,$2a$10$s31RLPwwyD5rvqj3RgejXO7VCWmZpj5QAi5dPNyO.4Cu.67LsO76m,goosehill trading,rory,true,2026-05-05 09:23:49.119811+00
2ea7f293-2d12-4637-a796-c973e25d2cee,rukandapride21@gmail.com,$2a$10$nF8qLKaJdgyn9V4TOxwjYefieaw8q68eqlcYDiQaKK8VurB1yy1pK,Rukanda Private,rukandapride21,true,2026-05-26 10:00:44.933504+00
e8003fde-ee7d-41db-8eeb-b6f297ebe33f,amossibanda66@gmail.com,$2a$10$pwQlwV.x/jMoBx2kRWCV6u..VxtU46uW.4lILjkdQ.yplMt1O/Ksy,Amos Sibanda,amossibanda66,true,2026-05-08 14:46:53.155106+00
7588d746-e11b-4686-a47c-74c677a65e37,clever@clerin.co.uk,$2a$10$OEG5iXwYKmMAZbjJJyqSm.hMEPD2vVCHUvNVyocB/ZMi1I.EuwuX6,Clever Tinarwo,clever,true,2026-06-17 10:44:09.657912+00
579f95dd-a4cc-4864-acf5-b062a3390884,demo@apolos.com,$2a$10$vifu6JWb6rlvXuDH5BQLneBZ0DWg9k67zvQXnrQG4.xdJ7QWqrd0y,APOLOS BRANDS,demo,true,2026-07-13 08:35:54.005409+00
210c0c6c-ffa4-4c78-afe3-b55cdddeb081,zimbolabels@gmail.com,$2a$10$ucNabjaIGS9TObk8P4YPWuCmFJBX7J2g.NbM/Sts6/6Yri7L1jqRG,Patrick Mapfumo,zimbolabels,true,2026-07-15 09:44:07.777231+00
05c5d244-271f-4e02-a705-e8b92da968a0,iindiwe@cortman.co.zw,$2a$10$gKXCaMMAVaUXzdHi4WOJ8u/bzyb0T4de/51BBXpxl5aUD44fZYDde,Lindiwe,iindiwe,true,2026-08-01 05:22:52.069864+00
4b124ebe-12a1-4cfe-83c8-ba6c068f2793,trevortakudzwachivandire@gmail.com,$2a$10$cX5yrBMRjUE8QEZi7lGnluSogBD9dJECw9C0.kQhVzSw2O0RLhDni,CLING-ON INVESTMENTS,trevortakudzwachivandire,true,2026-07-27 10:15:31.320909+00
bc47438a-1833-4c9d-b22a-89f1fde2ad13,innodb35@gmail.com,$2a$10$wCZv.QujaX5FaqbNWtLCT.g8tBgNosUlSm5O4Ne8d6R8RNEigk85K,Innocent Kurima,innodb35,true,2026-04-20 13:26:38.247508+00
f0b95363-a415-49e0-bbb1-b6d21dc07026,tmagongorere2@gmail.com,$2a$10$X6PR0T3hiufd2LwwACJM2u9zdBy7HK0uLBCf.sgJdaXxd/fFJ85Z.,Tatenda Matongorere,tmagongorere2,true,2026-07-23 18:22:20.433058+00
0f563f03-c6b9-466d-8ff2-b501de54b2e7,possystemszw@gmail.com,$2a$10$vid8ODv4Ag4qWRtP1Gzft.3eDKIZSXUWdjugHnnUdjQOsEJBg1mA.,James Maridadi,possystemszw,true,2026-05-26 17:46:30.835844+00
a5588393-338d-421e-b40a-cf43258a60e3,kambudzijames14@gmail.com,$2a$10$6kr1d.aMa2/dkS10upqABOhCisaeqSJbBJ5dt56HAv1VrlA23jq4K,James Kambudz,kambudzijames14,true,2026-08-08 07:22:12.653245+00
faced3d3-6333-4fa1-8fdf-68913d5877db,prosper@rabyon.com,$2a$10$gkHeT4C5tWsDZoPXxJrSF.nni3r3DiuVfJVN/lisouFhywrKRlay6,PROSPER,prosper,true,2026-07-20 16:57:28.462897+00
7bbdac85-e03c-4226-bb30-de61655bc091,sparesarenakaguvi@gmail.com,$2a$10$Tf5zB4xYbdJ1MzWlsRvKou5D7xKZZ6HsnB9kkbmDPRBKfrZnYppOa,Cathrine,sparesarenakaguvi,true,2026-05-20 10:22:00.771269+00
f6479d08-052f-42e5-963b-31db67572c3c,kennymadakwenda94@icloud.com,$2a$10$wsZ7i8NpJgCIiateF.YpXePGYkj1v1dc3v.k8tDKpRYf2.wHAQY2u,Parakletos Affordable Deals,kennymadakwenda94,true,2026-08-05 06:31:55.912507+00
0f6e8ff7-7002-4ecf-9c6b-ab33607291ae,npwmoyo@gmail.com,$2a$10$zVMh6Ma0pgh04mHmMy/78uHYkY6051f2.pSlOT9756Un6P.g3ZIx6,Jon Doe,npwmoyo,true,2026-06-01 10:19:04.110972+00
de4f2ec5-6ed6-48db-b737-7ad2c8c15db9,ginford@rabyon.com,$2a$10$j6b8zrNSUlXcNvVJWyNXZ.4bDIxJhTZ902jQpftWnoMe9xVAIRYnu,GINFORD,ginford,true,2026-07-20 16:58:16.487983+00
9cee5461-fef1-4ead-a0db-33752d2d5b38,testuser123@gmail.com,$2a$10$e3Dx3hYC5mHakUCy24faHu01P3ATzSGCQbpHvyFD8ZH2aiIsHO892,test user,testuser123,true,2026-07-19 09:23:02.237525+00
8124b96c-c32c-4e3d-95a1-da0701ef5e74,accounts@revaelitesolutions.com,$2a$10$IMlaBhjqy8FsLFjUbSMT6OEkthOhlaI77IFi5XMTuuACWu4uCh9K,REVALA ELITE SOLUTIONS,accounts,true,2026-07-27 11:02:39.985039+00
e40797ed-40aa-42f0-a9db-d30c1ccb239c,testuser12345@gmail.com,$2a$10$4mjJVMfW.ZpIqyCkh51lJec/x2RlM0q8YM9N9aTXRgPzshdzbRK8u,test user,testuser12345,true,2026-07-19 09:23:17.709353+00
26c3578c-99f3-4442-8627-5383f14d319d,tinashe@testcompany.com,$2a$10$qft2jVPvEUYebbHM3ANEmezKZVcV/40ao7IqpfzD0js5qe4cSPmZu,Tinashe Tsodzo,tinashe,true,2026-08-22 18:21:08.437701+00
7209bef6-c5cb-4851-84b7-a7b25b63baa3,testuser123456@gmail.com,$2a$10$htrneEpNAOZFAQb5orr3NeSpt9PRnyR0feBMRIfkZzx5zoH66wNEu,test user,testuser123456,true,2026-07-19 09:23:38.207177+00
2cfed38f-86fc-4826-a3f4-8e2a221bdb78,johanna123456@job.com,$2a$10$YfEZXh4OHiqWH1g5rmJ1bubXxlhKDSd4F5oWLIITqbpUrZ718BYBS,johanna,johanna123456,true,2026-07-24 17:20:54.55295+00
05a63e1c-b5e1-4999-bf2c-25f1125d21dd,munyah778@gmail.com,$2a$10$a6ZeDOhGacOSZ0qlHyHmB.uXY90fllfB23O.ShSJqDHek6Ce7LqNG,Munya,munyah778,true,2026-08-02 23:01:59.548227+00
d4e81374-1294-4a4d-a811-ae50351e77ee,accounts@eximiumbrands.co.zw,$2a$10$gjYng6QyZhvK7EB8sJHdc.yaNkWR1gZ6n4N8X9GukBY14O4vQTVvO,EXIMIUM PREMIUM BRANDS,accounts,true,2026-07-03 08:29:21.58429+00
ec026dc3-0346-4462-afe2-3cfcd4c9f248,nicholas.gwanzura@outlook.com,$2a$10$Xgnqpnp74/VJi3dhfQe5Puf92QHadkmluQx57y4Kfwv/xaZX5W3a.,Nick Gwanzura,nicholas.gwanzura,true,2026-06-29 13:42:35.066126+00
8f192fe1-0dd1-4cd4-a919-a8fbf016454e,princemak@pgzim.co.zw,$2a$10$ElRSLU33b9ohHd/Tqjwk6ehoZSfYZg9jDdiQ04FDUHXNPKu/EB6k2,PG DIOUS,princemak,true,2026-08-13 08:35:15.81558+00
6786cec1-9c77-44f7-95dd-61453bddd6ad,info@finmark.co.zw,$2a$10$Um1NWUsgag7vrIafxlEexOoyfTZBc.CfsBlDkS94tLt77B/snq9Ku,Finmark Electric & Hardware,info,true,2026-07-05 11:14:11.10013+00
ca33a58a-44db-4848-b157-39d66c89e642,mutsvenev@gmail.com,$2a$10$CeFNxuJLn382SLRSMndhYe9vV.doIdAqdZppFl/9LaBZ3huCGxoMi,Mutsvene VINCENT,mutsvenev,true,2026-07-06 11:25:58.421029+00
03867946-b39c-42b9-ad9a-365355b2e4ff,gchemhuru@gmail.com,$2a$10$ofyvwsUFk/cE7TsH1YQnGOSuhh3J8RYgsdRjoetqPmvGVkPUOA69C,Gabriel Tawonga Chemhuru,gchemhuru,true,2026-06-22 21:06:16.671221+00
9dcfb91d-9ad5-4bb3-ad96-32f2d476f97c,michaelmidzi@gmail.com,$2a$10$VgUYbgEN9vu6VKnZJJEyZuhu6ssOmcP46Jjis5jItWYxeSvyRccja,michaelmidzi@gmail.com,michaelmidzi,true,2026-06-27 17:00:56.030118+00`;

async function run() {
  const lines = raw.trim().split("\n");
  let inserted = 0, skipped = 0, failed = 0;
  for (const line of lines) {
    // split into 7 fields: id,email,password,name,username,password_changed,created_at
    // password contains no commas, name may contain commas/quotes but our data has simple commas inside quotes already handling via regex split?
    // Use regex to handle name with comma/quote: but data has no commas inside fields except maybe name with quotes - easiest: split by comma limited to 7
    // However hash never has comma, email never, id never. So we can parse from end.
    const parts = line.split(",");
    if (parts.length < 7) {
      console.error("Bad line (too few parts):", line);
      failed++;
      continue;
    }
    // last is created_at, which itself may contain comma? No.
    // second last is password_changed
    // third last is username
    // We need to reconstruct name which may contain commas
    const createdAt = parts.pop()!;
    // parts still has ... + password_changed
    const createdAtFull = parts[parts.length - 1].includes("+00") ? parts.pop()! : createdAt; // actually created_at has space: "2026-01-23 21:23:20.336955+00" was split into 2 parts if we naively split
    // So our split is broken for created_at containing space not comma. Wait created_at is "2026-01-23 21:23:20.336955+00" no comma, so fine.
    // Re-evaluate: line is id,email,password,name,username,password_changed,created_at
    // created_at has no comma, so pop once is correct for created_at
    // But we already popped? Let's redo parsing properly using approach: first 3 fields fixed, last 3 fixed, middle is name
  }
  // Better parsing: use pattern: id,email,hash,rest
  // hash always starts with $2a$ or $2b$ and has 60 chars with no commas
  inserted = 0; skipped = 0; failed = 0;
  for (const line of lines) {
    try {
      // Extract hash via regex
      const m = line.match(/^([^,]+),([^,]+),(\$2[aby]\$[^,]+),(.+)$/);
      if (!m) { console.error("No match:", line); failed++; continue; }
      const [, id, email, password, rest] = m;
      // rest is: name,username,password_changed,created_at
      // created_at is last field after last comma
      const lastComma = rest.lastIndexOf(",");
      const createdAt = rest.slice(lastComma + 1).trim();
      const rest2 = rest.slice(0, lastComma);
      const secondLastComma = rest2.lastIndexOf(",");
      const passwordChangedStr = rest2.slice(secondLastComma + 1).trim();
      const rest3 = rest2.slice(0, secondLastComma);
      const thirdLastComma = rest3.lastIndexOf(",");
      const username = rest3.slice(thirdLastComma + 1).trim();
      let name = rest3.slice(0, thirdLastComma).trim();
      // strip surrounding quotes if present
      if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1).replace(/""/g, '"');
      const passwordChanged = passwordChangedStr.toLowerCase() === "true";

      await pool.query(
        `INSERT INTO public.users (id, email, password, name, username, password_changed, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, password=EXCLUDED.password, name=EXCLUDED.name, username=EXCLUDED.username, password_changed=EXCLUDED.password_changed
        `,
        [id, email.trim().toLowerCase(), password, name || null, username || null, passwordChanged, createdAt]
      );
      inserted++;
    } catch (e: any) {
      // Handle unique email conflict
      if (e.code === '23505') {
        // Try update by email
        try {
          const m2 = line.match(/^([^,]+),([^,]+),(\$2[aby]\$[^,]+),(.+)$/);
          if (!m2) throw e;
          const [, id, email, password, rest] = m2;
          const lastComma = rest.lastIndexOf(",");
          const createdAt = rest.slice(lastComma + 1).trim();
          const rest2 = rest.slice(0, lastComma);
          const secondLastComma = rest2.lastIndexOf(",");
          const passwordChangedStr = rest2.slice(secondLastComma + 1).trim();
          const rest3 = rest2.slice(0, secondLastComma);
          const thirdLastComma = rest3.lastIndexOf(",");
          const username = rest3.slice(thirdLastComma + 1).trim();
          let name = rest3.slice(0, thirdLastComma).trim();
          if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1).replace(/""/g, '"');
          const passwordChanged = passwordChangedStr.toLowerCase() === "true";
          await pool.query(
            `UPDATE public.users SET id=$1, password=$3, name=$4, username=$5, password_changed=$6 WHERE email=$2`,
            [id, email.trim().toLowerCase(), password, name || null, username || null, passwordChanged]
          );
          skipped++;
        } catch (e2) {
          console.error("Conflict handle failed for", line, e2);
          failed++;
        }
      } else {
        console.error("Failed insert:", line.slice(0,80), e.message);
        failed++;
      }
    }
  }
  console.log(`Done: inserted=${inserted} updated/skipped=${skipped} failed=${failed}`);
  const cnt = await pool.query(`SELECT count(*) FROM public.users`);
  console.log("Total users now:", cnt.rows[0].count);
  await pool.end();
}

run().catch(e=>{console.error(e); pool.end();});

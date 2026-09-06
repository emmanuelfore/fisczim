import "dotenv/config";
import { pool } from "./server/db.js";
const raw = `4d611345-0a73-43d4-b648-d8c0bb5545fa,reladop474@muzitp.com,$2a$10$OtVhymFm9Bpe5QMW/5j5x.kX8M.LPC06SGwoPE3rAYBuDh5WJj3XK,Thamsanqa,reladop474,true,2026-07-09 07:19:53.41257+00
c0f91992-16c4-4dc4-8b00-10a0ec8209f1,jamesclemency5005@gmail.com,$2a$10$BdrtW/H/iA/Oy5s7Izkjl.wGtNTvtE09Jnw3krZfzqtOxvq6vNTsS,ELIMUZ,jamesclemency5005,true,2026-07-09 10:43:11.873853+00
c34fbabf-a563-4276-967f-ae4e45f17829,chaneilyosa@gamil.com,$2a$10$qrTbz/NszpfInZpi2jeGCOSbxwyPNvNh37VrfBFrv6yIO1Dlpig7K,Energyflow Systems,chaneilyosa,true,2026-07-05 11:57:38.187788+00
6a376ac4-bc27-4ff4-b1ec-6081e1459ba9,oliviam@utilitytechsupplies.com,$2a$10$ELZ2oHj52T5e2bFFrenw7OWL9PZbDJV4nsETPoZZ.DqZNRU/egx86,Utility Tech Supplies,oliviam,true,2026-07-05 10:50:09.259054+00
908580c2-9391-41d6-a63d-51940bd641e0,tmustsambiwa@gmail.com,$2a$10$lAFUvgiB5yHZU5zwrMpCPe1Q6J9Ts7dVZR2N3p4P5eU8iNM6o85SK,Tinotenda Mutsambiwa,tmustsambiwa,true,2026-07-06 15:17:23.623576+00
8e1b308d-4f61-4d56-8ab3-92843827f273,jamesclemency505@gmail.com,$2a$10$zR4g1F6Gm.0cunKMrtJxjOjlj1Gj7QSXg9dZA98YvtshlbJoByroq,ELIMUZ INVESTMENTS,jamesclemency505,true,2026-07-07 11:40:01.37961+00
fa204932-fcb1-442e-b5e4-4bd289c612ec,gwokudasam@gmail.com,$2a$10$zopTpem9KpjrGm6Pj/vk7.SI9cL0xHYW2oYW7w7YHFoMGJV2yV6g6,Samuel Gwokuda,gwokudasam,true,2026-07-12 13:26:40.512152+00
b1f2f4ad-63b8-43d3-8c23-0b309a2237de,testuser001@gmail.com,$2a$10$njLMvIUDU3dGhrgIGWUWuepoRryWZtd0qtm5.Ahwca7pCEMINiftO,test,testuser001,true,2026-06-22 08:45:05.517824+00
782de11a-46fe-4189-bfed-241fbac39cf7,precisetech2021@gmail.com,$2a$10$bpdrF7MPutXH2b16HyS6Z.5I3ouTNa9blajFh3ahQH0nnonjroRMG,Precise Technologies,precisetech2021,true,2026-07-13 14:17:16.865574+00
832e020e-30f6-4d4c-8d9b-ff77e37293c5,kassimshamilla09@gmail.com,$2a$10$0WLYPq3ny9agnbZbgR.HWOlMNPz.yVZ60ECiafm4pH67T6HNIWFYi,"Aaqil Meats ",kassimshamilla09,true,2026-08-04 05:38:48.526251+00
8088e79c-9071-4e38-a299-6c264f60108b,accounts@cia.co.zw,$2a$10$nuCPpwpnGMVyIYVHu4k3COtvb74ojXl35QoVJmlimrN7GUiVUN.ny,C.I.A Accounts,accounts,true,2026-08-05 10:48:41.62072+00
7e6b4521-fe43-4d1a-85ed-785cf411c50f,dadirai@appollos.co.zw,$2a$10$sHn8BRVsc6O5Ct5gnRlRcOsyFPhWfJF0AsJj7MfTksqxcAeb7RwX2,dadirai,dadirai,true,2026-07-21 07:43:25.041969+00
bc50e8b9-8bfc-4872-8e22-5748dc576eaf,wjose@techrehub.co.zw,$2a$10$rlo1cNUGQqY8I6nZkaJW7egh9c9kF/aCCME/IEp2BLG8rHfNHOt5O,William Jose,wjose,true,2026-07-20 11:46:07.868935+00
7a895379-0feb-4f86-89b7-a8993740c6bd,simba@cia.co.zw,$2a$10$6b7KiO7w4Z1Kv08UwiBnUOInaZk0Cztv517xwXLsbQpYdSLIaIUju,Simbarashe Bapiro,simba,true,2026-08-05 10:48:32.621064+00
6452c506-d360-450d-83eb-81352c34ec79,cashier000@gmail.com,$2a$10$hhWZCTIn7fAAV3CuIIpOIOipMLz3WwbyP2eribXDhKODiM.koIxK.,cashier000@gmail.com,cashier000,true,2026-07-24 17:54:18.968424+00
21042f4a-8e72-4f3a-b10e-4cc40e45880d,tanya@cia.co.zw,$2a$10$v.AcyJBbqbeiPQqWA3B8x.lAFhBZNaSMmAZgwTcNS.QpiQXczXyy2,Tanyaradzwa Chasweka,tanya,true,2026-08-05 10:48:43.544432+00
7d731609-83dc-4d46-afaa-1aa53427fb9d,accounts@revalaelitesoultions.com,$2a$10$s5QMpNhMDfXtkw8aFSZEAOFunh4qRPTFooesU3BTs0nDUHpQ0g3DW,REVALA ELITE SOLUTIONS,accounts,true,2026-07-27 11:09:05.209772+00
b1db605f-1fc5-4efa-b73d-55df29bd4283,admin@cia.co.zw,$2a$10$brp.bTzqdw67bU0iG3CuQO0X9k/ED2PzKovzNZcVeMNjr7husXSO6,Sharleen Mango,admin,true,2026-08-05 10:48:39.550885+00
378b8e6d-63ac-41b0-836c-22adc8aaa172,melissa@cia.co.zw,$2a$10$njWP3Vx73GdqhAJ4NE.yXOuVDd9iQSgl.eZj99cAH0Q2GI4IifbIu,Melissa Chibanda,melissa,true,2026-08-05 10:48:51.727728+00
3fa6b259-45f3-40de-b780-5f562f2a7be6,faith@cia.co.zw,$2a$10$LsF9R4h4GeuZZxB39r6U5OZoqesQRvkqU1aVj8R0irQFsufaKJPii,Faith Manjonjo,faith,true,2026-08-05 10:48:47.978572+00
e6d574e3-5ca9-4be9-9789-8292848afd55,zvikomborero@cia.co.zw,$2a$10$9lXd4z9a01HrZ3OaxI1QBekXhjk30DAA9uhSClJq6CrQODh0of5nW,Zvikomborero Tayera,zvikomborero,true,2026-08-05 10:48:57.84856+00
2a8fcde0-5801-45f1-b7f7-8bdc499f57ed,makanakaishe@cia.co.zw,$2a$10$1CtF9QmW9iHNHseIW/NOwOiB6YW87GWUg69Aqy6u.F6XPejDO4nHC,Makanakaishe Tawengwa,makanakaishe,true,2026-08-05 10:48:54.86515+00
4f2a466b-e170-43b5-a39d-b36dc52d168d,justin@appollos.co.zw,$2a$10$2ZnURGAS.JOkp1zZU/p6BOxOXbgYc/FU/sDJLkBYZQPuCTT2gYaU2,justin,justin,true,2026-07-21 07:43:23.64521+00
15d96ca2-0764-4550-ab32-fc5a8b7c3b8b,georgejanasi@gmail.com,$2a$10$vW39d.O0Y6azh2o8SkObCeaF6twnJmcRMYajPJ7vUb7693DUee0su,George Janasi,georgejanasi,true,2026-07-21 18:04:50.167951+00
3185219a-96d1-471d-a96b-2272773e21a2,starlink.imc@gmail.com,$2a$10$UXdz9Y3xKIAHbVeTkX1zMOZ32mpv5XB6X6i/6SrzCDnk0S5wQ743q,"Prosper Sparks ",starlink.imc,true,2026-07-13 18:57:25.091174+00
7ec414a2-20a5-4df1-8be1-70ff716b9afc,matariranwatapiwa@gmail.com,$2a$10$./H1fhm6nC24lbT7YKvI/.8Ms7O5bGwjoBEqLWfikbma079Ee4cQS,"Excellent Touch ",matariranwatapiwa,true,2026-08-05 14:19:36.58072+00
853892e8-531a-4fa9-b644-2556de69128a,getrude.ketero5@gmail.com,$2a$10$OmPYuGJ/UVpmQRDAMIzlbuO.G0ARosUYUYKZNCGck0wd6Cq/VBcpC,Moyo,getrude.ketero5,true,2026-07-25 02:31:44.920693+00
b51712f0-9149-459c-a298-4a73491c65b6,rabyonknowledge@gmail.com,$2a$10$r7WROkmNuDNz.ywmcE8H7.S2Xx7Ugjcv7DNhUyxEczjzQgUoO7xNC,Knowledge,rabyonknowledge,true,2026-07-20 12:02:04.604905+00
bc56fc9a-cce3-452c-8f50-f8a13348ba63,reubenchikafa@outlook.com,$2a$10$NrOw62.O4OENrVJW1Bo6gujJ1EJcIULGC852aKxpMJ.5afU2nqI6a,"Reuben Chikafa ",reubenchikafa,true,2026-08-13 16:17:11.412358+00
fc9ad6a5-6f5c-4e01-adb1-1adf7394b073,cashier@aaqil.com,$2a$10$Z3UJ99tK5clTW1NHaC0TSuFgA3ZXP4k62R6FRM/s9wG2OBFy.4pWy,Cashier,cashier,true,2026-08-04 06:19:12.268028+00
f9aac06d-8958-454b-bd9a-77e35e3c3579,motorsport247@yahoo.com,$2a$10$5iThnwgNcOg2otCPEZnmVeMkDprPXzoeUsJ33VpshmmUqeTGRqW,Carmen,motorsport247,true,2026-07-29 14:56:09.531667+00
ac22f715-d56c-486a-9d8b-d56eb6f68401,zimbolabel@gmail.com,$2a$10$N5/WFE205j3SxkXMIBnIaehDWAXVelcYTGRu3PcaexucW2F99XrrO,Zimbo label,zimbolabel,true,2026-07-15 09:05:08.915958+00
607423d4-e938-4f30-99bd-da9b0322df15,george@fiscalstack.co.zw,$2a$10$xHHMGBBOtvy1fWX/mXteE.L5FouG46Jm4ybYHozzE7lh6Lg2wWeBW,George,george,true,2026-07-26 17:20:53.16535+00
8de32ce7-b738-4a5d-8b18-7382ff93b37c,scottlubes@gmail.com,$2a$10$oReJ4FZFwWM4MCQf9O4QM.YZZ0PcIO5c3dzD32JqtGCPv5SIW5n9y,Scott Nelson Chihumba,scottlubes,true,2026-07-23 08:23:14.378025+00
1e4ccfa5-9639-450f-bf1d-04a85a1f13c2,brightmahiya@gmail.com,$2a$10$xYz/ZZF9dpDJtoX2hCkKHO5fY6bmWbMt580l5OmrGBejEr94y2Hi6,Bright,brightmahiya,true,2026-08-05 00:23:10.477542+00
0eaec81e-f1e2-40d3-93d2-515aaf1b8f5a,harrison@exceptionalbrands.ltd,$2a$10$34FB46c/IRc39E7tD242FuFTm9DDSomSqVx6AbsTGbhiH30D6MhQm,Harrison,harrison,true,2026-08-06 07:16:40.178942+00
634d587a-33f2-4064-b236-857fc2e0641b,ashleymupfururi01@gmail.com,$2a$10$a5x9nWguHq375i2xsTe.IemmMQzZU/fCaGO/VAEUgqf9W5K5rvNE2,"Ashley Mupfururi ",ashleymupfururi01,true,2026-08-17 19:01:58.16165+00
cd58af78-f6ee-458b-a2cf-d1bafd974898,sherpherdchimhowa@appollos.co.zw,$2a$10$4RNqVzxDdnMuGwNveW4xoOWNu3psBciIsM7RptpcHlyQB3G4JUJGm,Sheperd Chimhowa,sherpherdchimhowa,true,2026-07-17 13:58:37.799325+00
01b37fec-10b0-4981-912a-d2a8023ded67,tinashetsodzo3@gmail.com,$2a$10$p7F1yi2Oien22yZK7nnyueTV60pExR/jLPxxu1L4T9AWqySzMSyrq,Tinsashe Tsodzo,tinashetsodzo3,true,2026-08-24 13:41:48.77042+00
b288945b-7b1c-4279-9ff6-0cef21db9863,kuda@appollos.co.zw,$2a$10$OZ.1lcAiZQHhw92o32rOw.ONzXA.QvKTPBen5BrWJRU0yGnciWZ7C,Kudaishe Kadzamira,kuda,true,2026-07-17 14:01:23.278369+00
ec7dd2ab-e231-435b-861e-ad3630fc19c8,dynabalsolutions@gmail.com,$2a$10$.nLdV3OHmEpVXhl2SMp3Be1M3JE/.F6uX6AoPbQUnlelsdsqq9/yG,Takomborerwa Chapeta,dynabalsolutions,true,2026-01-19 09:19:49.294911+00
87c564f8-00ea-433e-8854-a3d4b7185b8f,sasha@appollos.co.zw,$2a$10$2c16yaBWjX/x69jwshjorOM9PQyXEff8KBdqHcWrMdvfg3uY8gJ0.,Sasha Masundire,sasha,true,2026-07-17 14:02:29.332947+00
38b5e162-c101-4d2b-a7e5-e9249b0100b1,demo@demo.com,$2a$10$WSCUrsGhdm4H7nNhtV6yIesXbHHXlx1oIo9lO0O7m1ABaxL0qXgNa,demo@demo.com,demo,true,2026-07-23 12:44:16.841409+00
10db5bb0-389f-4815-8107-c5ae44bb7d44,washingtonmapfumo@gmail.com,$2a$10$83GQ1ymoKoDiEbpmbQ4mfOhpzu9vUn/ociemvygRf0gugeP272lmC,Washington Mapfumo,washingtonmapfumo,true,2026-07-17 12:08:37.590331+00
c40bcfbc-e074-42e2-af3d-7f1e84e2af2e,shepherd@appollos.co.zw,$2a$10$SeCZrH9WPFCUOs0rbQujmO274jxgGhkCT6B9yFFMp3u08PSD6u6T2,Shepherd Chimhowa,shepherd,true,2026-07-17 14:00:35.315932+00
f9b46c57-0a94-4c8a-9a9f-adff0605782c,demo@demo1.com,$2a$10$keoQQCfIEM7HMrbJ.LLCle6Xebo1kiAIMop1IZ1dX/R9b3jR/h6va,demo@demo.com,demo,true,2026-07-23 12:44:38.103847+00
6946bb4f-9c4f-4794-8d42-048e39224a23,moses@revalaelitesolutions.com,$2a$10$Ajf6FmYMsg0D1YRbemsTq.//UsugLtRWgE7yMkFAUNpIowJExNrVW,Moses Marara,moses,true,2026-07-30 14:42:55.669081+00
a1be7846-f204-4b8a-b6c7-29a09b9b4e6a,pmuzah@appollos.co.zw,$2a$10$2YT6RFVwGsJRUdihxUQi5uPoHrhXraB/VcKgSDQePy0xVLMGQedK6,Precious Muzah,pmuzah,true,2026-07-17 14:04:05.650783+00
7bf8ae3f-a16d-497b-920e-a12a75ebe6b1,knowledge@rabyon.com,$2a$10$a7CxKSLr77tYdycDK7v8ceAP9Z5/aBASYBcpqAjoVuKgjtnxafY.K,KNOWLEDGE,knowledge,true,2026-07-20 16:54:11.520512+00
bca99c1c-3ace-4849-9b64-7782d1e4b4ce,admin@appollos.co.zw,$2a$10$akoVLLrgFJJkgTxAruMHhuzAVVFZlEsOWBQNcp5KYTU2yLIPtucja,Cecelia Kagura,admin,true,2026-07-17 13:51:08.142528+00
e5d39ff9-c585-4b8c-a4ea-75473365607d,accounts@appollos.co.zw,$2a$10$b3oQ8TQt1YFRHohuKc7zs.WY7aKiGaAZ1tyDIxNWvKSJpgiRnM0R2,Accounts,accounts,true,2026-07-17 14:03:07.603907+00
82c8f590-ca54-40af-9b00-14526ba8151f,rabyoninvestments23@gmail.com,$2a$10$13M28Op11yakrnUa8WkMLe5yLL4FYcQ44ApXTMiPOVn5WgLpvTXZG,RABYON INVESTMENTS,rabyoninvestments23,true,2026-07-17 09:15:34.008+00
68f7c0d2-a0cd-4015-9c2d-1bf6a721bc9f,admin@zimra.co.zw,$2a$10$I/jYrdrCNi9xd61x2JDcmu2FphpThSP41YtfNIuHeR5bNSmMuwNP6,System Super Admin,admin,true,2026-01-26 07:00:56.688987+00
782e3f74-320e-45c4-87d4-1e7220e78e1f,mdalaibrahim@gmail.com,$2a$10$e/SEgqcsnP0k.vdOuSRl9.MVj.jBNdo/RMtuIwXjrB4YYFwbQ58L6,Ibrahim Mdala,mdalaibrahim,true,2026-04-11 11:21:21.248269+00
c6de53a3-b939-4e4c-82ce-b4ae62b5633b,testuser002@gmail.com,$2a$10$khzSS.eqitmQ6bUuLUnQp.3sKZzjAmE85WPvvOtGeXqzYxTrr7qiy,Test user2,testuser002,true,2026-08-05 06:53:41.248466+00
b021d911-12dc-4a6d-a1cd-340fd45c91c2,talpactinv@gmail.com,$2a$10$aqCD1BvsCed0fg/wvXMMUOhTzd.NqEGOKq7sgejRlS3RJTPQtALYa,P CHikaratani,talpactinv,true,2026-08-31 06:37:46.080618+00
2d1fd617-20e4-4b75-b525-d40c25acd5cd,sales@revalaelitesolutions.com,$2a$10$S4ju/cVFYbinw9I0cliZHOo4p0zuvPdLFcctrMA9gcwa4L6AmRMrS,Revala Elite Solutions,sales,true,2026-07-30 12:25:38.336477+00
13e11656-fc16-4035-8f25-0f99a9da4bb6,tawandattimire@gmail.com,$2a$10$u3wR2BdC1Y2nyKUVZDF4ge9fJVaLGMtD1q.WKOJx/WXZHBRvw0FXy,Tawanda Timire,tawandattimire,true,2026-01-30 15:32:34.649978+00
b72d80ae-31c4-4484-b517-564c7cd3cef1,admin@fiscalstake.co.zw,$2a$10$MMkACYrdb0bqpJLCIq78.eeDZ1cxEjqmD/53.//EYkB96jWmVy.P2,FiscalStake Admin,admin,true,2026-02-10 08:05:27.700365+00
f086249f-0459-4185-85c4-a999c785bc3d,munyaguveya@gmail.com,$2a$10$6a8E32pjMDkH76Rf4Pni9OJdBV8b4DGq87dLT8vFHKigc1CQOlKcK,Munyaradzi Guveya,munyaguveya,true,2026-02-07 10:01:12.630941+00
839672e5-eb9c-4a9a-8ace-03b80a4be4e7,jollybutchery@gmail.com,$2a$10$BlrA/RUUHHMA8CMobFcxou3OvEmtGmNt46OYedLnLtOrba1ds4bzC,JOLLY JONGWE BUTCHERY,jollybutchery,true,2026-03-18 13:45:55.655715+00
9c4cd4c6-ffad-438f-8ca6-11c471be1595,jollyadmin@gmail.com,$2a$10$pZ8yBEWkIzEnufM5Qlkvuuoak.Tl0Qkv.XJxVnJlsh9tSaUb9U2bO,Jolly Admin,jollyadmin,true,2026-04-17 09:15:57.940248+00
681c2a48-8c51-4cae-b429-6d033599bea4,henry@gmail.com,$2a$10$dvmjbyH1imD8/J32nzDo5uyboWhSmbp4bbNp5f/u0yX1AtA2/Eqoi,patiesithole@yahoo.com,henry,true,2026-03-20 18:29:05.721441+00
cc715b1c-fa25-4587-8faf-c0d14c82f128,anesu3788@gmail.com,$2a$10$6TiJY1mIMBDF9DsRxZLYw.O6pXPAnx1AaR8yNxgJrZkmAPmszGrBa,john bhuru,anesu3788,true,2026-08-23 11:54:28.72833+00
d8648d50-3500-49ac-b4e9-ea024dc69f2e,patiesithole@gmail.com,$2a$10$icUuCbDmZ6gVyuyBmupHn.iJWnjQC1pbFaICO49fEFwI1nu7PB2c6,"Depopi Enterprises ",patiesithole,true,2026-08-28 11:51:19.609626+00
b919bb90-cef3-4137-a904-574fcc0e98cb,warehouse@depopi.com,$2a$10$nRhdd.zx9pATX1Ln44mS.uAqXWFApEZsKAu5JuNuo.y3Lm3s4.uzC,Warehouse,warehouse,true,2026-09-01 14:08:07.112346+00
77096a8f-3908-4702-aa37-171c183f2aa5,knowledge1@rabyon.com,$2a$10$5jf0WNoXwvCZ0.dVe.Q2rueMIAhIngdT58vu3k4OfRfHPl6EV199i,KNOWLEDGE,knowledge1,true,2026-07-21 07:29:46.209494+00
c5769539-38fb-4558-9c91-df80c7b44cdf,johnmoyo@gmail.com,$2a$10$.OG5aEjkRkqocfUTVstj4OQ77AUYEa.ZcS34cXZLTWBwsjKb8bbGO,johnmoyo,johnmoyo,true,2026-05-20 20:17:56.741496+00
977dce88-fc8f-41a8-8bdd-53a8055f6cdf,thamanyanentepe@gmail.com,$2a$10$ppgq8.eBRQx3VHUsF/n2tOwoabuIW95RF5x.O5pUp4KVm9fcZ5qPm,Thamanyane Ntepe,thamanyanentepe,true,2026-08-24 07:03:08.716414+00
7cfd3a3c-eacb-447a-99e6-461335231202,chinhoyi@khadee.com,$2a$10$K8hgsBi1SL9OxSgu3RdSFuqLs5Q4jxMzCaKmYgvJn9NjHj99wvtvG,Chinhoyi Store,chinhoyi,true,2026-08-21 14:18:16.143376+00
296b4606-f0d6-4f29-9833-f5b589ad3c4e,angelina@gmail.com,$2a$10$xOmpXsIEs1hIpgMDTuNyGelALShSGfqZltSBStIPj450/IJQW2J0S,Angelina,angelina,true,2026-08-28 12:55:15.107122+00
cc74a365-4de6-406d-a763-e10fe799efb8,chinhoyistore@gmail.com,$2a$10$lT161CAm9Bxr9m8aGz3DlOFq19plXlZcGcH5EiSAvZ8naKkdpYwTS,Chinhoyi Store,chinhoyistore,true,2026-08-21 07:39:35.734246+00
effb05da-2372-4872-a9c1-6cc2255fec15,lin360364@gmail.com,$2a$10$watGv/olmFAIRxMQ.dZS9.FJYYiVIadNgALyv7MNiWEregcnw8nP2,"lyn ",lin360364,true,2026-05-20 11:16:57.684529+00`;
async function run(){
  const lines = raw.trim().split("\n");
  let inserted=0, skipped=0, failed=0;
  for(const line of lines){
    try{
      const m = line.match(/^([^,]+),([^,]+),(\$2[aby]\$[^,]+),(.+)$/);
      if(!m){ console.error("No match", line.slice(0,60)); failed++; continue; }
      const [,id,email,password,rest]=m;
      const lastComma = rest.lastIndexOf(",");
      const createdAt = rest.slice(lastComma+1).trim();
      const rest2 = rest.slice(0,lastComma);
      const secondLastComma = rest2.lastIndexOf(",");
      const passwordChangedStr = rest2.slice(secondLastComma+1).trim();
      const rest3 = rest2.slice(0,secondLastComma);
      const thirdLastComma = rest3.lastIndexOf(",");
      const username = rest3.slice(thirdLastComma+1).trim();
      let name = rest3.slice(0,thirdLastComma).trim();
      if(name.startsWith('"') && name.endsWith('"')) name=name.slice(1,-1).replace(/""/g,'"');
      const passwordChanged = passwordChangedStr.toLowerCase()==="true";
      await pool.query(`INSERT INTO public.users (id, email, password, name, username, password_changed, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, password=EXCLUDED.password, name=EXCLUDED.name, username=EXCLUDED.username, password_changed=EXCLUDED.password_changed`, [id, email.trim().toLowerCase(), password, name||null, username||null, passwordChanged, createdAt]);
      inserted++;
    }catch(e:any){
      if(e.code==='23505'){
        try{
          const m2 = line.match(/^([^,]+),([^,]+),(\$2[aby]\$[^,]+),(.+)$/);
          if(!m2) throw e;
          const [,id,email,password,rest]=m2;
          const lastComma = rest.lastIndexOf(",");
          const rest2 = rest.slice(0,lastComma);
          const secondLastComma = rest2.lastIndexOf(",");
          const passwordChangedStr = rest2.slice(secondLastComma+1).trim();
          const rest3 = rest2.slice(0,secondLastComma);
          const thirdLastComma = rest3.lastIndexOf(",");
          const username = rest3.slice(thirdLastComma+1).trim();
          let name = rest3.slice(0,thirdLastComma).trim();
          if(name.startsWith('"') && name.endsWith('"')) name=name.slice(1,-1);
          const passwordChanged = passwordChangedStr.toLowerCase()==="true";
          await pool.query(`UPDATE public.users SET id=$1, password=$3, name=$4, username=$5, password_changed=$6 WHERE email=$2`, [id, email.trim().toLowerCase(), password, name||null, username||null, passwordChanged]);
          skipped++;
        }catch(e2:any){ console.error(e2.message); failed++; }
      } else { console.error(e.message); failed++; }
    }
  }
  console.log(`Done inserted=${inserted} skipped=${skipped} failed=${failed}`);
  const cnt = await pool.query(`SELECT count(*) FROM public.users`);
  console.log("total", cnt.rows[0].count);
  await pool.end();
}
run();

-- Apply after mood/reports migrations, in a maintenance window before new deployment.
-- Existing rows are preserved; NOT VALID checks enforce all NEW/UPDATED rows.
BEGIN;
CREATE SCHEMA IF NOT EXISTS pinit_private;
REVOKE ALL ON SCHEMA pinit_private FROM PUBLIC, anon, authenticated;

-- Preserve legacy identifiers for operator-controlled deletion, never public reads.
CREATE TABLE IF NOT EXISTS pinit_private.legacy_note_identifiers AS
  SELECT id, ip_hash FROM public.notes;
ALTER TABLE public.notes DROP COLUMN IF EXISTS ip_hash;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS mood text;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

-- Remove every policy, including old/unknown permissive ones.
DO $$ DECLARE r record; c record; BEGIN
  FOR r IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN ('notes','submissions','reports') LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
  FOR r IN SELECT unnest(ARRAY['notes','submissions','reports']) AS name LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',r.name);
    -- Column grants must also be removed: table REVOKE alone is insufficient.
    FOR c IN SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=r.name LOOP
      EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC, anon, authenticated',c.column_name,r.name);
    END LOOP;
  END LOOP;
END $$;
CREATE POLICY notes_select_public ON public.notes FOR SELECT TO anon, authenticated USING (hidden=false);
GRANT SELECT (id,content,alias,color,country,country_code,mood,note_date,created_at,hidden) ON public.notes TO anon, authenticated;

ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_content_length_check;
ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_alias_length_check;
ALTER TABLE public.notes ADD CONSTRAINT notes_content_length_check CHECK (
  content IS NOT NULL AND char_length(content) BETWEEN 1 AND 700 AND
  regexp_replace(content, E'[\n\r\t]', '', 'g') !~ '[[:cntrl:]]' AND
  cardinality(regexp_split_to_array(btrim(content), E'\\s+')) BETWEEN 3 AND 60
) NOT VALID;
-- Alias whitelist: Unicode 16.0.0 letters/marks/numbers plus name punctuation.
ALTER TABLE public.notes ADD CONSTRAINT notes_alias_length_check CHECK (
  alias IS NOT NULL AND char_length(alias) BETWEEN 1 AND 40 AND alias=btrim(alias) AND
  alias ~ U&'^[\0020\0027\002e\005f\2019\0030-\0039\0041-\005a\0061-\007a\00aa\00b2-\00b3\00b5\00b9-\00ba\00bc-\00be\00c0-\00d6\00d8-\00f6\00f8-\02c1\02c6-\02d1\02e0-\02e4\02ec\02ee\0300-\0374\0376-\0377\037a-\037d\037f\0386\0388-\038a\038c\038e-\03a1\03a3-\03f5\03f7-\0481\0483-\052f\0531-\0556\0559\0560-\0588\0591-\05bd\05bf\05c1-\05c2\05c4-\05c5\05c7\05d0-\05ea\05ef-\05f2\0610-\061a\0620-\0669\066e-\06d3\06d5-\06dc\06df-\06e8\06ea-\06fc\06ff\0710-\074a\074d-\07b1\07c0-\07f5\07fa\07fd\0800-\082d\0840-\085b\0860-\086a\0870-\0887\0889-\088e\0897-\08e1\08e3-\0963\0966-\096f\0971-\0983\0985-\098c\098f-\0990\0993-\09a8\09aa-\09b0\09b2\09b6-\09b9\09bc-\09c4\09c7-\09c8\09cb-\09ce\09d7\09dc-\09dd\09df-\09e3\09e6-\09f1\09f4-\09f9\09fc\09fe\0a01-\0a03\0a05-\0a0a\0a0f-\0a10\0a13-\0a28\0a2a-\0a30\0a32-\0a33\0a35-\0a36\0a38-\0a39\0a3c\0a3e-\0a42\0a47-\0a48\0a4b-\0a4d\0a51\0a59-\0a5c\0a5e\0a66-\0a75\0a81-\0a83\0a85-\0a8d\0a8f-\0a91\0a93-\0aa8\0aaa-\0ab0\0ab2-\0ab3\0ab5-\0ab9\0abc-\0ac5\0ac7-\0ac9\0acb-\0acd\0ad0\0ae0-\0ae3\0ae6-\0aef\0af9-\0aff\0b01-\0b03\0b05-\0b0c\0b0f-\0b10\0b13-\0b28\0b2a-\0b30\0b32-\0b33\0b35-\0b39\0b3c-\0b44\0b47-\0b48\0b4b-\0b4d\0b55-\0b57\0b5c-\0b5d\0b5f-\0b63\0b66-\0b6f\0b71-\0b77\0b82-\0b83\0b85-\0b8a\0b8e-\0b90\0b92-\0b95\0b99-\0b9a\0b9c\0b9e-\0b9f\0ba3-\0ba4\0ba8-\0baa\0bae-\0bb9\0bbe-\0bc2\0bc6-\0bc8\0bca-\0bcd\0bd0\0bd7\0be6-\0bf2\0c00-\0c0c\0c0e-\0c10\0c12-\0c28\0c2a-\0c39\0c3c-\0c44\0c46-\0c48\0c4a-\0c4d\0c55-\0c56\0c58-\0c5a\0c5d\0c60-\0c63\0c66-\0c6f\0c78-\0c7e\0c80-\0c83\0c85-\0c8c\0c8e-\0c90\0c92-\0ca8\0caa-\0cb3\0cb5-\0cb9\0cbc-\0cc4\0cc6-\0cc8\0cca-\0ccd\0cd5-\0cd6\0cdd-\0cde\0ce0-\0ce3\0ce6-\0cef\0cf1-\0cf3\0d00-\0d0c\0d0e-\0d10\0d12-\0d44\0d46-\0d48\0d4a-\0d4e\0d54-\0d63\0d66-\0d78\0d7a-\0d7f\0d81-\0d83\0d85-\0d96\0d9a-\0db1\0db3-\0dbb\0dbd\0dc0-\0dc6\0dca\0dcf-\0dd4\0dd6\0dd8-\0ddf\0de6-\0def\0df2-\0df3\0e01-\0e3a\0e40-\0e4e\0e50-\0e59\0e81-\0e82\0e84\0e86-\0e8a\0e8c-\0ea3\0ea5\0ea7-\0ebd\0ec0-\0ec4\0ec6\0ec8-\0ece\0ed0-\0ed9\0edc-\0edf\0f00\0f18-\0f19\0f20-\0f33\0f35\0f37\0f39\0f3e-\0f47\0f49-\0f6c\0f71-\0f84\0f86-\0f97\0f99-\0fbc\0fc6\1000-\1049\1050-\109d\10a0-\10c5\10c7\10cd\10d0-\10fa\10fc-\1248\124a-\124d\1250-\1256\1258\125a-\125d\1260-\1288\128a-\128d\1290-\12b0\12b2-\12b5\12b8-\12be\12c0\12c2-\12c5\12c8-\12d6\12d8-\1310\1312-\1315\1318-\135a\135d-\135f\1369-\137c\1380-\138f\13a0-\13f5\13f8-\13fd\1401-\166c\166f-\167f\1681-\169a\16a0-\16ea\16ee-\16f8\1700-\1715\171f-\1734\1740-\1753\1760-\176c\176e-\1770\1772-\1773\1780-\17d3\17d7\17dc-\17dd\17e0-\17e9\17f0-\17f9\180b-\180d\180f-\1819\1820-\1878\1880-\18aa\18b0-\18f5\1900-\191e\1920-\192b\1930-\193b\1946-\196d\1970-\1974\1980-\19ab\19b0-\19c9\19d0-\19da\1a00-\1a1b\1a20-\1a5e\1a60-\1a7c\1a7f-\1a89\1a90-\1a99\1aa7\1ab0-\1ace\1b00-\1b4c\1b50-\1b59\1b6b-\1b73\1b80-\1bf3\1c00-\1c37\1c40-\1c49\1c4d-\1c7d\1c80-\1c8a\1c90-\1cba\1cbd-\1cbf\1cd0-\1cd2\1cd4-\1cfa\1d00-\1f15\1f18-\1f1d\1f20-\1f45\1f48-\1f4d\1f50-\1f57\1f59\1f5b\1f5d\1f5f-\1f7d\1f80-\1fb4\1fb6-\1fbc\1fbe\1fc2-\1fc4\1fc6-\1fcc\1fd0-\1fd3\1fd6-\1fdb\1fe0-\1fec\1ff2-\1ff4\1ff6-\1ffc\2070-\2071\2074-\2079\207f-\2089\2090-\209c\20d0-\20f0\2102\2107\210a-\2113\2115\2119-\211d\2124\2126\2128\212a-\212d\212f-\2139\213c-\213f\2145-\2149\214e\2150-\2189\2460-\249b\24ea-\24ff\2776-\2793\2c00-\2ce4\2ceb-\2cf3\2cfd\2d00-\2d25\2d27\2d2d\2d30-\2d67\2d6f\2d7f-\2d96\2da0-\2da6\2da8-\2dae\2db0-\2db6\2db8-\2dbe\2dc0-\2dc6\2dc8-\2dce\2dd0-\2dd6\2dd8-\2dde\2de0-\2dff\2e2f\3005-\3007\3021-\302f\3031-\3035\3038-\303c\3041-\3096\3099-\309a\309d-\309f\30a1-\30fa\30fc-\30ff\3105-\312f\3131-\318e\3192-\3195\31a0-\31bf\31f0-\31ff\3220-\3229\3248-\324f\3251-\325f\3280-\3289\32b1-\32bf\3400-\4dbf\4e00-\a48c\a4d0-\a4fd\a500-\a60c\a610-\a62b\a640-\a672\a674-\a67d\a67f-\a6f1\a717-\a71f\a722-\a788\a78b-\a7cd\a7d0-\a7d1\a7d3\a7d5-\a7dc\a7f2-\a827\a82c\a830-\a835\a840-\a873\a880-\a8c5\a8d0-\a8d9\a8e0-\a8f7\a8fb\a8fd-\a92d\a930-\a953\a960-\a97c\a980-\a9c0\a9cf-\a9d9\a9e0-\a9fe\aa00-\aa36\aa40-\aa4d\aa50-\aa59\aa60-\aa76\aa7a-\aac2\aadb-\aadd\aae0-\aaef\aaf2-\aaf6\ab01-\ab06\ab09-\ab0e\ab11-\ab16\ab20-\ab26\ab28-\ab2e\ab30-\ab5a\ab5c-\ab69\ab70-\abea\abec-\abed\abf0-\abf9\ac00-\d7a3\d7b0-\d7c6\d7cb-\d7fb\f900-\fa6d\fa70-\fad9\fb00-\fb06\fb13-\fb17\fb1d-\fb28\fb2a-\fb36\fb38-\fb3c\fb3e\fb40-\fb41\fb43-\fb44\fb46-\fbb1\fbd3-\fd3d\fd50-\fd8f\fd92-\fdc7\fdf0-\fdfb\fe00-\fe0f\fe20-\fe2f\fe70-\fe74\fe76-\fefc\ff10-\ff19\ff21-\ff3a\ff41-\ff5a\ff66-\ffbe\ffc2-\ffc7\ffca-\ffcf\ffd2-\ffd7\ffda-\ffdc\+010000-\+01000b\+01000d-\+010026\+010028-\+01003a\+01003c-\+01003d\+01003f-\+01004d\+010050-\+01005d\+010080-\+0100fa\+010107-\+010133\+010140-\+010178\+01018a-\+01018b\+0101fd\+010280-\+01029c\+0102a0-\+0102d0\+0102e0-\+0102fb\+010300-\+010323\+01032d-\+01034a\+010350-\+01037a\+010380-\+01039d\+0103a0-\+0103c3\+0103c8-\+0103cf\+0103d1-\+0103d5\+010400-\+01049d\+0104a0-\+0104a9\+0104b0-\+0104d3\+0104d8-\+0104fb\+010500-\+010527\+010530-\+010563\+010570-\+01057a\+01057c-\+01058a\+01058c-\+010592\+010594-\+010595\+010597-\+0105a1\+0105a3-\+0105b1\+0105b3-\+0105b9\+0105bb-\+0105bc\+0105c0-\+0105f3\+010600-\+010736\+010740-\+010755\+010760-\+010767\+010780-\+010785\+010787-\+0107b0\+0107b2-\+0107ba\+010800-\+010805\+010808\+01080a-\+010835\+010837-\+010838\+01083c\+01083f-\+010855\+010858-\+010876\+010879-\+01089e\+0108a7-\+0108af\+0108e0-\+0108f2\+0108f4-\+0108f5\+0108fb-\+01091b\+010920-\+010939\+010980-\+0109b7\+0109bc-\+0109cf\+0109d2-\+010a03\+010a05-\+010a06\+010a0c-\+010a13\+010a15-\+010a17\+010a19-\+010a35\+010a38-\+010a3a\+010a3f-\+010a48\+010a60-\+010a7e\+010a80-\+010a9f\+010ac0-\+010ac7\+010ac9-\+010ae6\+010aeb-\+010aef\+010b00-\+010b35\+010b40-\+010b55\+010b58-\+010b72\+010b78-\+010b91\+010ba9-\+010baf\+010c00-\+010c48\+010c80-\+010cb2\+010cc0-\+010cf2\+010cfa-\+010d27\+010d30-\+010d39\+010d40-\+010d65\+010d69-\+010d6d\+010d6f-\+010d85\+010e60-\+010e7e\+010e80-\+010ea9\+010eab-\+010eac\+010eb0-\+010eb1\+010ec2-\+010ec4\+010efc-\+010f27\+010f30-\+010f54\+010f70-\+010f85\+010fb0-\+010fcb\+010fe0-\+010ff6\+011000-\+011046\+011052-\+011075\+01107f-\+0110ba\+0110c2\+0110d0-\+0110e8\+0110f0-\+0110f9\+011100-\+011134\+011136-\+01113f\+011144-\+011147\+011150-\+011173\+011176\+011180-\+0111c4\+0111c9-\+0111cc\+0111ce-\+0111da\+0111dc\+0111e1-\+0111f4\+011200-\+011211\+011213-\+011237\+01123e-\+011241\+011280-\+011286\+011288\+01128a-\+01128d\+01128f-\+01129d\+01129f-\+0112a8\+0112b0-\+0112ea\+0112f0-\+0112f9\+011300-\+011303\+011305-\+01130c\+01130f-\+011310\+011313-\+011328\+01132a-\+011330\+011332-\+011333\+011335-\+011339\+01133b-\+011344\+011347-\+011348\+01134b-\+01134d\+011350\+011357\+01135d-\+011363\+011366-\+01136c\+011370-\+011374\+011380-\+011389\+01138b\+01138e\+011390-\+0113b5\+0113b7-\+0113c0\+0113c2\+0113c5\+0113c7-\+0113ca\+0113cc-\+0113d3\+0113e1-\+0113e2\+011400-\+01144a\+011450-\+011459\+01145e-\+011461\+011480-\+0114c5\+0114c7\+0114d0-\+0114d9\+011580-\+0115b5\+0115b8-\+0115c0\+0115d8-\+0115dd\+011600-\+011640\+011644\+011650-\+011659\+011680-\+0116b8\+0116c0-\+0116c9\+0116d0-\+0116e3\+011700-\+01171a\+01171d-\+01172b\+011730-\+01173b\+011740-\+011746\+011800-\+01183a\+0118a0-\+0118f2\+0118ff-\+011906\+011909\+01190c-\+011913\+011915-\+011916\+011918-\+011935\+011937-\+011938\+01193b-\+011943\+011950-\+011959\+0119a0-\+0119a7\+0119aa-\+0119d7\+0119da-\+0119e1\+0119e3-\+0119e4\+011a00-\+011a3e\+011a47\+011a50-\+011a99\+011a9d\+011ab0-\+011af8\+011bc0-\+011be0\+011bf0-\+011bf9\+011c00-\+011c08\+011c0a-\+011c36\+011c38-\+011c40\+011c50-\+011c6c\+011c72-\+011c8f\+011c92-\+011ca7\+011ca9-\+011cb6\+011d00-\+011d06\+011d08-\+011d09\+011d0b-\+011d36\+011d3a\+011d3c-\+011d3d\+011d3f-\+011d47\+011d50-\+011d59\+011d60-\+011d65\+011d67-\+011d68\+011d6a-\+011d8e\+011d90-\+011d91\+011d93-\+011d98\+011da0-\+011da9\+011ee0-\+011ef6\+011f00-\+011f10\+011f12-\+011f3a\+011f3e-\+011f42\+011f50-\+011f5a\+011fb0\+011fc0-\+011fd4\+012000-\+012399\+012400-\+01246e\+012480-\+012543\+012f90-\+012ff0\+013000-\+01342f\+013440-\+013455\+013460-\+0143fa\+014400-\+014646\+016100-\+016139\+016800-\+016a38\+016a40-\+016a5e\+016a60-\+016a69\+016a70-\+016abe\+016ac0-\+016ac9\+016ad0-\+016aed\+016af0-\+016af4\+016b00-\+016b36\+016b40-\+016b43\+016b50-\+016b59\+016b5b-\+016b61\+016b63-\+016b77\+016b7d-\+016b8f\+016d40-\+016d6c\+016d70-\+016d79\+016e40-\+016e96\+016f00-\+016f4a\+016f4f-\+016f87\+016f8f-\+016f9f\+016fe0-\+016fe1\+016fe3-\+016fe4\+016ff0-\+016ff1\+017000-\+0187f7\+018800-\+018cd5\+018cff-\+018d08\+01aff0-\+01aff3\+01aff5-\+01affb\+01affd-\+01affe\+01b000-\+01b122\+01b132\+01b150-\+01b152\+01b155\+01b164-\+01b167\+01b170-\+01b2fb\+01bc00-\+01bc6a\+01bc70-\+01bc7c\+01bc80-\+01bc88\+01bc90-\+01bc99\+01bc9d-\+01bc9e\+01ccf0-\+01ccf9\+01cf00-\+01cf2d\+01cf30-\+01cf46\+01d165-\+01d169\+01d16d-\+01d172\+01d17b-\+01d182\+01d185-\+01d18b\+01d1aa-\+01d1ad\+01d242-\+01d244\+01d2c0-\+01d2d3\+01d2e0-\+01d2f3\+01d360-\+01d378\+01d400-\+01d454\+01d456-\+01d49c\+01d49e-\+01d49f\+01d4a2\+01d4a5-\+01d4a6\+01d4a9-\+01d4ac\+01d4ae-\+01d4b9\+01d4bb\+01d4bd-\+01d4c3\+01d4c5-\+01d505\+01d507-\+01d50a\+01d50d-\+01d514\+01d516-\+01d51c\+01d51e-\+01d539\+01d53b-\+01d53e\+01d540-\+01d544\+01d546\+01d54a-\+01d550\+01d552-\+01d6a5\+01d6a8-\+01d6c0\+01d6c2-\+01d6da\+01d6dc-\+01d6fa\+01d6fc-\+01d714\+01d716-\+01d734\+01d736-\+01d74e\+01d750-\+01d76e\+01d770-\+01d788\+01d78a-\+01d7a8\+01d7aa-\+01d7c2\+01d7c4-\+01d7cb\+01d7ce-\+01d7ff\+01da00-\+01da36\+01da3b-\+01da6c\+01da75\+01da84\+01da9b-\+01da9f\+01daa1-\+01daaf\+01df00-\+01df1e\+01df25-\+01df2a\+01e000-\+01e006\+01e008-\+01e018\+01e01b-\+01e021\+01e023-\+01e024\+01e026-\+01e02a\+01e030-\+01e06d\+01e08f\+01e100-\+01e12c\+01e130-\+01e13d\+01e140-\+01e149\+01e14e\+01e290-\+01e2ae\+01e2c0-\+01e2f9\+01e4d0-\+01e4f9\+01e5d0-\+01e5fa\+01e7e0-\+01e7e6\+01e7e8-\+01e7eb\+01e7ed-\+01e7ee\+01e7f0-\+01e7fe\+01e800-\+01e8c4\+01e8c7-\+01e8d6\+01e900-\+01e94b\+01e950-\+01e959\+01ec71-\+01ecab\+01ecad-\+01ecaf\+01ecb1-\+01ecb4\+01ed01-\+01ed2d\+01ed2f-\+01ed3d\+01ee00-\+01ee03\+01ee05-\+01ee1f\+01ee21-\+01ee22\+01ee24\+01ee27\+01ee29-\+01ee32\+01ee34-\+01ee37\+01ee39\+01ee3b\+01ee42\+01ee47\+01ee49\+01ee4b\+01ee4d-\+01ee4f\+01ee51-\+01ee52\+01ee54\+01ee57\+01ee59\+01ee5b\+01ee5d\+01ee5f\+01ee61-\+01ee62\+01ee64\+01ee67-\+01ee6a\+01ee6c-\+01ee72\+01ee74-\+01ee77\+01ee79-\+01ee7c\+01ee7e\+01ee80-\+01ee89\+01ee8b-\+01ee9b\+01eea1-\+01eea3\+01eea5-\+01eea9\+01eeab-\+01eebb\+01f100-\+01f10c\+01fbf0-\+01fbf9\+020000-\+02a6df\+02a700-\+02b739\+02b740-\+02b81d\+02b820-\+02cea1\+02ceb0-\+02ebe0\+02ebf0-\+02ee5d\+02f800-\+02fa1d\+030000-\+03134a\+031350-\+0323af\+0e0100-\+0e01ef\002d]+$'
) NOT VALID;
ALTER TABLE public.notes ADD CONSTRAINT notes_color_whitelist CHECK (color IS NOT NULL AND color IN
 ('#e63946','#f4842a','#f7c948','#2dc653','#1a7abf','#7b2ff7','#e040a0','#00b4d8','#ff6b35','#1b4332','#1a1814','#c94040')) NOT VALID;
ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_mood_check;
ALTER TABLE public.notes ADD CONSTRAINT notes_mood_check CHECK (mood IS NULL OR mood IN
 ('hopeful','tired','lonely','grateful','angry','peaceful','lost')) NOT VALID;
ALTER TABLE public.notes ADD CONSTRAINT notes_country_check CHECK (
 country IS NOT NULL AND char_length(country) BETWEEN 1 AND 80 AND country !~ '[[:cntrl:]<>";`]' AND
 country_code IS NOT NULL AND (country_code='' OR country_code ~ '^[A-Z]{2}$') AND note_date IS NOT NULL
) NOT VALID;

CREATE TABLE pinit_private.daily_notes (
 limiter_key text NOT NULL CHECK (limiter_key ~ '^[a-f0-9]{64}$'),
 note_date date NOT NULL, note_id uuid,
 PRIMARY KEY(limiter_key,note_date)
);
CREATE TABLE pinit_private.rate_limits (
 key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE public.admin_sessions (
 token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL
);
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_sessions TO service_role;

CREATE FUNCTION public.take_rate_limit(p_key text, p_max integer, p_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; BEGIN
 IF p_key !~ '^[a-f0-9]{64}$' OR p_max < 1 OR p_seconds NOT BETWEEN 1 AND 86400 THEN RAISE EXCEPTION 'Invalid limiter'; END IF;
 INSERT INTO pinit_private.rate_limits AS rl VALUES (p_key,1,now()+make_interval(secs=>p_seconds))
 ON CONFLICT(key) DO UPDATE SET
 hits=CASE WHEN rl.expires_at<=now() THEN 1 ELSE LEAST(rl.hits+1,p_max+1) END,
 expires_at=CASE WHEN rl.expires_at<=now() THEN now()+make_interval(secs=>p_seconds) ELSE rl.expires_at END
 RETURNING hits INTO n;
 RETURN n<=p_max;
END $$;

CREATE FUNCTION public.create_daily_note(p_key text,p_day date,p_content text,p_alias text,p_color text,p_mood text,p_country text,p_country_code text)
RETURNS TABLE(id uuid,content text,alias text,color text,mood text,country text,country_code text,note_date date,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE day date := (now() AT TIME ZONE 'UTC')::date; new_id uuid;
BEGIN
 IF p_day IS DISTINCT FROM day THEN RAISE EXCEPTION 'UTC date rollover: retry'; END IF;
 INSERT INTO pinit_private.daily_notes(limiter_key,note_date) VALUES(p_key,day);
 INSERT INTO public.notes(content,alias,color,mood,country,country_code,note_date)
 VALUES(p_content,p_alias,p_color,p_mood,p_country,p_country_code,day) RETURNING notes.id INTO new_id;
 UPDATE pinit_private.daily_notes SET note_id=new_id WHERE limiter_key=p_key AND daily_notes.note_date=day;
 RETURN QUERY SELECT n.id,n.content,n.alias,n.color,n.mood,n.country,n.country_code,n.note_date,n.created_at FROM public.notes n WHERE n.id=new_id;
END $$;
REVOKE ALL ON FUNCTION public.take_rate_limit(text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_daily_note(text,date,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_rate_limit(text,integer,integer), public.create_daily_note(text,date,text,text,text,text,text,text) TO service_role;
-- Avoid Supabase Realtime broadcasting whole rows outside column-projected reads.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notes') THEN
 ALTER PUBLICATION supabase_realtime DROP TABLE public.notes;
 END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;

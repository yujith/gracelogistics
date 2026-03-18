-- ============================================================
-- Grace Logistics – Seed Port Data
-- Major global ports for rate search dropdowns
-- Run this AFTER schema.sql in Supabase SQL Editor
-- ============================================================

INSERT INTO ports (name, country, port_code) VALUES
-- Sri Lanka
('Colombo', 'Sri Lanka', 'LKCMB'),
('Hambantota', 'Sri Lanka', 'LKHRI'),

-- China
('Shanghai', 'China', 'CNSHA'),
('Shenzhen (Yantian)', 'China', 'CNYAN'),
('Ningbo', 'China', 'CNNGB'),
('Qingdao', 'China', 'CNTAO'),
('Xiamen', 'China', 'CNXMN'),
('Guangzhou (Nansha)', 'China', 'CNNSA'),
('Dalian', 'China', 'CNDLC'),
('Tianjin (Xingang)', 'China', 'CNTSN'),

-- Hong Kong
('Hong Kong', 'Hong Kong', 'HKHKG'),

-- South East Asia
('Singapore', 'Singapore', 'SGSIN'),
('Port Klang', 'Malaysia', 'MYPKG'),
('Tanjung Pelepas', 'Malaysia', 'MYTPP'),
('Laem Chabang', 'Thailand', 'THLCH'),
('Bangkok', 'Thailand', 'THBKK'),
('Ho Chi Minh City (Cat Lai)', 'Vietnam', 'VNSGN'),
('Hai Phong', 'Vietnam', 'VNHPH'),
('Jakarta (Tanjung Priok)', 'Indonesia', 'IDJKT'),
('Surabaya', 'Indonesia', 'IDSUB'),
('Manila', 'Philippines', 'PHMNL'),

-- Indian Subcontinent
('Nhava Sheva (JNPT)', 'India', 'INNSA'),
('Mundra', 'India', 'INMUN'),
('Chennai', 'India', 'INMAA'),
('Kolkata', 'India', 'INCCU'),
('Cochin', 'India', 'INCOK'),
('Tuticorin', 'India', 'INTUT'),
('Visakhapatnam', 'India', 'INVTZ'),
('Chittagong', 'Bangladesh', 'BDCGP'),
('Karachi', 'Pakistan', 'PKKHI'),

-- Middle East
('Jebel Ali (Dubai)', 'UAE', 'AEJEA'),
('Abu Dhabi', 'UAE', 'AEAUH'),
('Jeddah', 'Saudi Arabia', 'SAJED'),
('Dammam', 'Saudi Arabia', 'SADMM'),
('Salalah', 'Oman', 'OMSLL'),
('Sohar', 'Oman', 'OMSOH'),
('Hamad (Doha)', 'Qatar', 'QADOH'),
('Bahrain', 'Bahrain', 'BHBAH'),
('Bandar Abbas', 'Iran', 'IRBND'),

-- Europe
('Rotterdam', 'Netherlands', 'NLRTM'),
('Antwerp', 'Belgium', 'BEANR'),
('Hamburg', 'Germany', 'DEHAM'),
('Bremerhaven', 'Germany', 'DEBRV'),
('Felixstowe', 'United Kingdom', 'GBFXT'),
('Southampton', 'United Kingdom', 'GBSOU'),
('Le Havre', 'France', 'FRLEH'),
('Barcelona', 'Spain', 'ESBCN'),
('Valencia', 'Spain', 'ESVLC'),
('Genoa', 'Italy', 'ITGOA'),
('Piraeus', 'Greece', 'GRPIR'),
('Gdansk', 'Poland', 'PLGDN'),
('Gothenburg', 'Sweden', 'SEGOT'),

-- Mediterranean & Africa
('Port Said', 'Egypt', 'EGPSD'),
('Durban', 'South Africa', 'ZADUR'),
('Mombasa', 'Kenya', 'KEMBA'),
('Djibouti', 'Djibouti', 'DJJIB'),
('Tanger Med', 'Morocco', 'MAPTM'),

-- Americas
('Los Angeles', 'United States', 'USLAX'),
('Long Beach', 'United States', 'USLGB'),
('New York / New Jersey', 'United States', 'USNYC'),
('Savannah', 'United States', 'USSAV'),
('Houston', 'United States', 'USHOU'),
('Charleston', 'United States', 'USCHS'),
('Seattle / Tacoma', 'United States', 'USSEA'),
('Santos', 'Brazil', 'BRSSZ'),
('Buenos Aires', 'Argentina', 'ARBUE'),
('Callao', 'Peru', 'PECLL'),
('Manzanillo', 'Mexico', 'MXZLO'),

-- Oceania
('Melbourne', 'Australia', 'AUMEL'),
('Sydney', 'Australia', 'AUSYD'),
('Brisbane', 'Australia', 'AUBNE'),
('Fremantle', 'Australia', 'AUFRE'),
('Auckland', 'New Zealand', 'NZAKL'),
('Tauranga', 'New Zealand', 'NZTRG'),

-- East Asia (Japan, South Korea, Taiwan)
('Tokyo (Yokohama)', 'Japan', 'JPYOK'),
('Kobe', 'Japan', 'JPUKB'),
('Busan', 'South Korea', 'KRPUS'),
('Incheon', 'South Korea', 'KRINC'),
('Kaohsiung', 'Taiwan', 'TWKHH')
ON CONFLICT (port_code) DO NOTHING;

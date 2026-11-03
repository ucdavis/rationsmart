"""
Time zone for each country's report time (FTC REC-02-D).

A report's "Generated" time is printed in the simulation country's local time, as
the app screen shows it. Keys are the ISO 3166 alpha-3 codes of the `country`
table; values are IANA zone names. A country with several zones uses its
capital's (e.g. Indonesia -> Asia/Jakarta, United States -> America/New_York).
Built 2026-11-03 from the IANA zone list (pytz.country_timezones); a country
added to the table later needs a line here, or its reports show UTC.
"""
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

COUNTRY_TIME_ZONES = {
    "AFG": "Asia/Kabul",  # Afghanistan
    "AGO": "Africa/Luanda",  # Angola
    "ALB": "Europe/Tirane",  # Albania
    "AND": "Europe/Andorra",  # Andorra
    "ARE": "Asia/Dubai",  # United Arab Emirates
    "ARG": "America/Argentina/Buenos_Aires",  # Argentina
    "ARM": "Asia/Yerevan",  # Armenia
    "AUS": "Australia/Sydney",  # Australia
    "AUT": "Europe/Vienna",  # Austria
    "AZE": "Asia/Baku",  # Azerbaijan
    "BDI": "Africa/Bujumbura",  # Burundi
    "BEL": "Europe/Brussels",  # Belgium
    "BEN": "Africa/Porto-Novo",  # Benin
    "BFA": "Africa/Ouagadougou",  # Burkina Faso
    "BGD": "Asia/Dhaka",  # Bangladesh
    "BGR": "Europe/Sofia",  # Bulgaria
    "BHR": "Asia/Bahrain",  # Bahrain
    "BHS": "America/Nassau",  # Bahamas
    "BIH": "Europe/Sarajevo",  # Bosnia and Herzegovina
    "BLR": "Europe/Minsk",  # Belarus
    "BLZ": "America/Belize",  # Belize
    "BOL": "America/La_Paz",  # Bolivia
    "BRA": "America/Sao_Paulo",  # Brazil
    "BRB": "America/Barbados",  # Barbados
    "BRN": "Asia/Brunei",  # Brunei
    "BTN": "Asia/Thimphu",  # Bhutan
    "BWA": "Africa/Gaborone",  # Botswana
    "CAF": "Africa/Bangui",  # Central African Republic
    "CAN": "America/Toronto",  # Canada
    "CHE": "Europe/Zurich",  # Switzerland
    "CHL": "America/Santiago",  # Chile
    "CHN": "Asia/Shanghai",  # China
    "CIV": "Africa/Abidjan",  # Ivory Coast
    "CMR": "Africa/Douala",  # Cameroon
    "COD": "Africa/Kinshasa",  # Democratic Republic of the Congo
    "COG": "Africa/Brazzaville",  # Congo
    "COL": "America/Bogota",  # Colombia
    "COM": "Indian/Comoro",  # Comoros
    "CPV": "Atlantic/Cape_Verde",  # Cape Verde
    "CRI": "America/Costa_Rica",  # Costa Rica
    "CUB": "America/Havana",  # Cuba
    "CYP": "Asia/Nicosia",  # Cyprus
    "CZE": "Europe/Prague",  # Czech Republic
    "DEU": "Europe/Berlin",  # Germany
    "DJI": "Africa/Djibouti",  # Djibouti
    "DMA": "America/Dominica",  # Dominica
    "DNK": "Europe/Copenhagen",  # Denmark
    "DOM": "America/Santo_Domingo",  # Dominican Republic
    "DZA": "Africa/Algiers",  # Algeria
    "ECU": "America/Guayaquil",  # Ecuador
    "EGY": "Africa/Cairo",  # Egypt
    "ERI": "Africa/Asmara",  # Eritrea
    "ESP": "Europe/Madrid",  # Spain
    "EST": "Europe/Tallinn",  # Estonia
    "ETH": "Africa/Addis_Ababa",  # Ethiopia
    "FIN": "Europe/Helsinki",  # Finland
    "FJI": "Pacific/Fiji",  # Fiji
    "FRA": "Europe/Paris",  # France
    "FSM": "Pacific/Pohnpei",  # Micronesia
    "GAB": "Africa/Libreville",  # Gabon
    "GBR": "Europe/London",  # United Kingdom
    "GEO": "Asia/Tbilisi",  # Georgia
    "GHA": "Africa/Accra",  # Ghana
    "GIN": "Africa/Conakry",  # Guinea
    "GMB": "Africa/Banjul",  # Gambia
    "GNB": "Africa/Bissau",  # Guinea-Bissau
    "GNQ": "Africa/Malabo",  # Equatorial Guinea
    "GRC": "Europe/Athens",  # Greece
    "GRD": "America/Grenada",  # Grenada
    "GTM": "America/Guatemala",  # Guatemala
    "GUY": "America/Guyana",  # Guyana
    "HND": "America/Tegucigalpa",  # Honduras
    "HRV": "Europe/Zagreb",  # Croatia
    "HTI": "America/Port-au-Prince",  # Haiti
    "HUN": "Europe/Budapest",  # Hungary
    "IDN": "Asia/Jakarta",  # Indonesia
    "IND": "Asia/Kolkata",  # India
    "IRL": "Europe/Dublin",  # Ireland
    "IRN": "Asia/Tehran",  # Iran
    "IRQ": "Asia/Baghdad",  # Iraq
    "ISL": "Atlantic/Reykjavik",  # Iceland
    "ISR": "Asia/Jerusalem",  # Israel
    "ITA": "Europe/Rome",  # Italy
    "JAM": "America/Jamaica",  # Jamaica
    "JOR": "Asia/Amman",  # Jordan
    "JPN": "Asia/Tokyo",  # Japan
    "KAZ": "Asia/Almaty",  # Kazakhstan
    "KEN": "Africa/Nairobi",  # Kenya
    "KGZ": "Asia/Bishkek",  # Kyrgyzstan
    "KHM": "Asia/Phnom_Penh",  # Cambodia
    "KIR": "Pacific/Tarawa",  # Kiribati
    "KNA": "America/St_Kitts",  # Saint Kitts and Nevis
    "KOR": "Asia/Seoul",  # South Korea
    "KWT": "Asia/Kuwait",  # Kuwait
    "LAO": "Asia/Vientiane",  # Laos
    "LBN": "Asia/Beirut",  # Lebanon
    "LBR": "Africa/Monrovia",  # Liberia
    "LBY": "Africa/Tripoli",  # Libya
    "LCA": "America/St_Lucia",  # Saint Lucia
    "LIE": "Europe/Vaduz",  # Liechtenstein
    "LKA": "Asia/Colombo",  # Sri Lanka
    "LSO": "Africa/Maseru",  # Lesotho
    "LTU": "Europe/Vilnius",  # Lithuania
    "LUX": "Europe/Luxembourg",  # Luxembourg
    "LVA": "Europe/Riga",  # Latvia
    "MAR": "Africa/Casablanca",  # Morocco
    "MCO": "Europe/Monaco",  # Monaco
    "MDA": "Europe/Chisinau",  # Moldova
    "MDG": "Indian/Antananarivo",  # Madagascar
    "MDV": "Indian/Maldives",  # Maldives
    "MEX": "America/Mexico_City",  # Mexico
    "MHL": "Pacific/Majuro",  # Marshall Islands
    "MKD": "Europe/Skopje",  # North Macedonia
    "MLI": "Africa/Bamako",  # Mali
    "MLT": "Europe/Malta",  # Malta
    "MMR": "Asia/Yangon",  # Myanmar
    "MNE": "Europe/Podgorica",  # Montenegro
    "MNG": "Asia/Ulaanbaatar",  # Mongolia
    "MOZ": "Africa/Maputo",  # Mozambique
    "MRT": "Africa/Nouakchott",  # Mauritania
    "MUS": "Indian/Mauritius",  # Mauritius
    "MWI": "Africa/Blantyre",  # Malawi
    "MYS": "Asia/Kuala_Lumpur",  # Malaysia
    "NAM": "Africa/Windhoek",  # Namibia
    "NER": "Africa/Niamey",  # Niger
    "NGA": "Africa/Lagos",  # Nigeria
    "NIC": "America/Managua",  # Nicaragua
    "NLD": "Europe/Amsterdam",  # Netherlands
    "NOR": "Europe/Oslo",  # Norway
    "NPL": "Asia/Kathmandu",  # Nepal
    "NRU": "Pacific/Nauru",  # Nauru
    "NZL": "Pacific/Auckland",  # New Zealand
    "OMN": "Asia/Muscat",  # Oman
    "PAK": "Asia/Karachi",  # Pakistan
    "PAN": "America/Panama",  # Panama
    "PER": "America/Lima",  # Peru
    "PHL": "Asia/Manila",  # Philippines
    "PLW": "Pacific/Palau",  # Palau
    "PNG": "Pacific/Port_Moresby",  # Papua New Guinea
    "POL": "Europe/Warsaw",  # Poland
    "PRK": "Asia/Pyongyang",  # North Korea
    "PRT": "Europe/Lisbon",  # Portugal
    "PRY": "America/Asuncion",  # Paraguay
    "QAT": "Asia/Qatar",  # Qatar
    "ROU": "Europe/Bucharest",  # Romania
    "RUS": "Europe/Moscow",  # Russia
    "RWA": "Africa/Kigali",  # Rwanda
    "SAU": "Asia/Riyadh",  # Saudi Arabia
    "SDN": "Africa/Khartoum",  # Sudan
    "SEN": "Africa/Dakar",  # Senegal
    "SGP": "Asia/Singapore",  # Singapore
    "SLB": "Pacific/Guadalcanal",  # Solomon Islands
    "SLE": "Africa/Freetown",  # Sierra Leone
    "SLV": "America/El_Salvador",  # El Salvador
    "SMR": "Europe/San_Marino",  # San Marino
    "SOM": "Africa/Mogadishu",  # Somalia
    "SRB": "Europe/Belgrade",  # Serbia
    "SSD": "Africa/Juba",  # South Sudan
    "STP": "Africa/Sao_Tome",  # Sao Tome and Principe
    "SUR": "America/Paramaribo",  # Suriname
    "SVK": "Europe/Bratislava",  # Slovakia
    "SVN": "Europe/Ljubljana",  # Slovenia
    "SWE": "Europe/Stockholm",  # Sweden
    "SWZ": "Africa/Mbabane",  # Eswatini
    "SYC": "Indian/Mahe",  # Seychelles
    "SYR": "Asia/Damascus",  # Syria
    "TCD": "Africa/Ndjamena",  # Chad
    "TGO": "Africa/Lome",  # Togo
    "THA": "Asia/Bangkok",  # Thailand
    "TJK": "Asia/Dushanbe",  # Tajikistan
    "TKM": "Asia/Ashgabat",  # Turkmenistan
    "TLS": "Asia/Dili",  # Timor-Leste
    "TON": "Pacific/Tongatapu",  # Tonga
    "TTO": "America/Port_of_Spain",  # Trinidad and Tobago
    "TUN": "Africa/Tunis",  # Tunisia
    "TUR": "Europe/Istanbul",  # Turkey
    "TUV": "Pacific/Funafuti",  # Tuvalu
    "TWN": "Asia/Taipei",  # Taiwan
    "TZA": "Africa/Dar_es_Salaam",  # Tanzania
    "UGA": "Africa/Kampala",  # Uganda
    "UKR": "Europe/Kyiv",  # Ukraine
    "URY": "America/Montevideo",  # Uruguay
    "USA": "America/New_York",  # United States
    "UZB": "Asia/Tashkent",  # Uzbekistan
    "VAT": "Europe/Vatican",  # Vatican City
    "VCT": "America/St_Vincent",  # Saint Vincent and the Grenadines
    "VEN": "America/Caracas",  # Venezuela
    "VNM": "Asia/Ho_Chi_Minh",  # Vietnam
    "VUT": "Pacific/Efate",  # Vanuatu
    "WSM": "Pacific/Apia",  # Samoa
    "YEM": "Asia/Aden",  # Yemen
    "ZAF": "Africa/Johannesburg",  # South Africa
    "ZMB": "Africa/Lusaka",  # Zambia
    "ZWE": "Africa/Harare",  # Zimbabwe
}


def country_time_zone(country_code: Optional[str]) -> Optional[str]:
    """IANA zone for an alpha-3 country code, or None when unknown or not installed."""
    zone = COUNTRY_TIME_ZONES.get((country_code or "").strip().upper())
    if zone is None:
        return None
    try:
        ZoneInfo(zone)
    except (ZoneInfoNotFoundError, ValueError):
        return None
    return zone

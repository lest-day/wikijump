/*
 * web/reference.rs
 *
 * DEEPWELL - Wikijump API provider and database manager
 * Copyright (C) 2021 Wikijump Team
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

use crate::api::ApiRequest;
use std::convert::TryFrom;
use tide::{Error, StatusCode};

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq)]
pub enum Reference<'a> {
    Id(i64),
    Slug(&'a str),
}

impl From<i64> for Reference<'static> {
    #[inline]
    fn from(id: i64) -> Reference<'static> {
        Reference::Id(id)
    }
}

impl<'a> From<&'a str> for Reference<'a> {
    #[inline]
    fn from(slug: &'a str) -> Reference<'a> {
        Reference::Slug(slug)
    }
}

impl<'a> TryFrom<&'a ApiRequest> for Reference<'a> {
    type Error = Error;

    fn try_from(req: &'a ApiRequest) -> Result<Reference<'a>, Error> {
        let value_type = req.param("type")?;
        let value = req.param("id_or_slug")?;

        match value_type {
            "slug" => {
                tide::log::debug!("Reference via slug, {}", value);

                Ok(Reference::Slug(value))
            }
            "id" => {
                tide::log::debug!("Reference via ID, {}", value);

                let id = value.parse()?;
                Ok(Reference::Id(id))
            }
            _ => Err(Error::from_str(
                StatusCode::BadRequest,
                "May only specify object by 'id' or 'slug'",
            )),
        }
    }
}

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq)]
pub enum Direction {
    From,
    To,
}

#[derive(Debug, Copy, Clone, Hash, PartialEq, Eq)]
pub struct DirectedReference<'a> {
    pub direction: Direction,
    pub reference: Reference<'a>,
}

impl<'a> TryFrom<&'a ApiRequest> for DirectedReference<'a> {
    type Error = Error;

    fn try_from(req: &'a ApiRequest) -> Result<DirectedReference<'a>, Error> {
        #[derive(Debug)]
        enum Kind {
            Id,
            Slug,
        }

        let value_type = req.param("directed_type")?;
        let value = req.param("id_or_slug")?;

        let (direction, kind) = match value_type {
            "from-id" => (Direction::From, Kind::Id),
            "to-id" => (Direction::To, Kind::Id),
            "from-slug" => (Direction::From, Kind::Slug),
            "to-slug" => (Direction::To, Kind::Slug),
            _ => return Err(Error::from_str(
                StatusCode::BadRequest,
                "May only specify object as 'from-id', 'from-slug', 'to-id', or 'to-slug'",
            )),
        };

        let reference = match kind {
            Kind::Slug => Reference::Slug(value),
            Kind::Id => {
                let id = value.parse()?;
                Reference::Id(id)
            }
        };

        Ok(DirectedReference {
            direction,
            reference,
        })
    }
}
